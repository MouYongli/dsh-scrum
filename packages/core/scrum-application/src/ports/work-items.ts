import {
  compareRanks,
  isWorkItemBlocked,
  type IdentityId,
  type Priority,
  type ProjectId,
  type Revision,
  type SprintId,
  type WorkItem,
  type WorkItemId,
  type WorkItemStatus,
  type WorkItemType,
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

export function matchesWorkItemFilter(item: WorkItem, filter: WorkItemFilter): boolean {
  const text = filter.text?.trim().toLowerCase()
  return (
    includesOrEmpty(filter.statuses, item.status) &&
    includesOrEmpty(filter.types, item.type) &&
    includesOrEmpty(filter.priorities, item.priority) &&
    matchesOptional(filter.sprintId, item.sprintId) &&
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
  return [...items]
    .filter((item) => matchesWorkItemFilter(item, filter))
    .sort((left, right) => compareRanks(left.rank, right.rank))
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
