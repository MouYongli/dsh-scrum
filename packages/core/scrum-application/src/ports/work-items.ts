import {
  compareRanks,
  isWorkItemBlocked,
  type IdentityId,
  type Priority,
  type ProjectId,
  type Revision,
  type SprintId,
  type WorkItem,
  type WorkItemCategory,
  type WorkItemId,
  type WorkItemLevel,
  type WorkItemResolution,
  type WorkItemStatus,
  type WorkItemType,
  workItemRequiresParent,
} from '@dsh-scrum/scrum-domain'

/**
 * What a backlog or board view is asking for.
 *
 * An absent field means "do not narrow by this"; an explicit `null` where the
 * type allows one means "the ones with nothing there" — no sprint, no
 * assignee, no parent. Those two have to be distinguishable, because the
 * backlog is exactly the items with no sprint and a filter that could not say
 * so could not describe the backlog.
 */
export interface WorkItemFilter {
  readonly statuses?: readonly WorkItemStatus[] | undefined
  readonly types?: readonly WorkItemType[] | undefined
  readonly levels?: readonly WorkItemLevel[] | undefined
  /** Matches an item classified as one of these. Unclassified matches none. */
  readonly categories?: readonly WorkItemCategory[] | undefined
  /** Only finished items carry one, so this narrows to finished work. */
  readonly resolutions?: readonly WorkItemResolution[] | undefined
  readonly priorities?: readonly Priority[] | undefined
  readonly sprintId?: SprintId | null | undefined
  readonly assigneeId?: IdentityId | null | undefined
  readonly parentId?: WorkItemId | null | undefined
  /** Matches an item carrying any one of these labels. */
  readonly labels?: readonly string[] | undefined
  readonly blocked?: boolean | undefined
  /** Case-insensitive substring of the title or the description. */
  readonly text?: string | undefined
}

function includesOrEmpty<Value>(allowed: readonly Value[] | undefined, value: Value): boolean {
  return allowed === undefined || allowed.includes(value)
}

function matchesOptional<Value>(expected: Value | undefined, actual: Value): boolean {
  return expected === undefined || expected === actual
}

/**
 * Whether one item matches, given the sprint it counts as being in.
 *
 * The sprint is passed in because a level 3 item holds none of its own: the
 * one item this can see is not enough to answer where it sits, so the caller
 * that can see the whole set resolves it. Every other field is the item's own.
 */
export function matchesWorkItemFilter(
  item: WorkItem,
  filter: WorkItemFilter,
  sprintId: SprintId | null = item.sprintId,
): boolean {
  const text = filter.text?.trim().toLowerCase()
  return (
    includesOrEmpty(filter.statuses, item.status) &&
    includesOrEmpty(filter.types, item.type) &&
    includesOrEmpty(filter.levels, item.level) &&
    (filter.categories === undefined ||
      (item.category !== null && filter.categories.includes(item.category))) &&
    (filter.resolutions === undefined ||
      (item.resolution !== null && filter.resolutions.includes(item.resolution))) &&
    includesOrEmpty(filter.priorities, item.priority) &&
    matchesOptional(filter.sprintId, sprintId) &&
    matchesOptional(filter.assigneeId, item.assigneeId) &&
    matchesOptional(filter.parentId, item.parentId) &&
    matchesOptional(filter.blocked, isWorkItemBlocked(item)) &&
    (filter.labels === undefined || filter.labels.some((label) => item.labels.includes(label))) &&
    (text === undefined ||
      text === '' ||
      item.title.toLowerCase().includes(text) ||
      item.description.toLowerCase().includes(text))
  )
}

/**
 * The filter made executable, so a store that can only scan applies exactly
 * the rule a store that can push the filter down has to reproduce. Backlog
 * order is rank order, and it is applied here rather than left to each caller.
 */
export function filterWorkItems(
  items: Iterable<WorkItem>,
  filter: WorkItemFilter,
): readonly WorkItem[] {
  const all = [...items]
  const byId = new Map(all.map((item) => [item.id, item]))
  return all
    .filter((item) => matchesWorkItemFilter(item, filter, effectiveSprintOf(item, byId)))
    .sort((left, right) => compareRanks(left.rank, right.rank))
}

/**
 * The sprint an item counts as being in.
 *
 * A level 3 item reads its parent's, so asking for a sprint's contents returns
 * the subtasks of the items planned into it. A parent outside the loaded set
 * leaves the child unplaced rather than guessed at — the alternative is
 * reporting a subtask as being in the backlog because its parent was filtered
 * out of the same query.
 */
function effectiveSprintOf(
  item: WorkItem,
  byId: ReadonlyMap<WorkItemId, WorkItem>,
): SprintId | null {
  if (!workItemRequiresParent(item.level) || item.parentId === null) {
    return item.sprintId
  }
  return byId.get(item.parentId)?.sprintId ?? null
}

export interface WorkItemRepository {
  find(projectId: ProjectId, id: WorkItemId): Promise<WorkItem | null>
  list(projectId: ProjectId, filter: WorkItemFilter): Promise<readonly WorkItem[]>
  /**
   * The next free identifier for the project.
   *
   * Allocation and creation cannot be one step across a port with no
   * transaction, so two creators can be handed the same number. `create`
   * refuses the second, and the use case asks again; a store that serialises
   * its writes never gets there.
   */
  nextIdentifier(projectId: ProjectId): Promise<WorkItemId>
  /** Refuses with a `ConflictError` if the identifier is already taken. */
  create(item: WorkItem): Promise<void>
  save(item: WorkItem, expected: Revision): Promise<void>
  remove(projectId: ProjectId, id: WorkItemId, expected: Revision): Promise<void>
}
