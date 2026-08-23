import { ValidationError } from './errors.js'
import type { IdentityId, ProjectId, SprintId, WorkItemId } from './ids.js'
import { createEntityMetadata, touchEntityMetadata, type EntityMetadata } from './metadata.js'
import type { Rank } from './rank.js'
import { requireOptionalText, requireText } from './text.js'
import type { Timestamp } from './time.js'
import { WORK_ITEM_STATUS, type WorkItemStatus } from './workflow.js'

const MAX_TITLE_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 20000
const MAX_LABELS = 20
const MAX_LABEL_LENGTH = 40
const MAX_ACCEPTANCE_CRITERIA = 50
const MAX_ACCEPTANCE_CRITERION_LENGTH = 500
const MAX_ESTIMATE = 1000
const MAX_BLOCKED_REASON_LENGTH = 500

/**
 * The kinds of work a project tracks. Persisted, so the values may be added to
 * but never renamed.
 *
 * Five rather than six: a spike is a task carrying the spike category, not a
 * type of its own. This enum fixes the hierarchy and the fields a type brings
 * with it, and a semantic distinction worth two extra fields would otherwise
 * add a branch to every type check and every type selector in the product.
 */
export const WORK_ITEM_TYPE = {
  epic: 'epic',
  story: 'story',
  task: 'task',
  bug: 'bug',
  subtask: 'subtask',
} as const

export type WorkItemType = (typeof WORK_ITEM_TYPE)[keyof typeof WORK_ITEM_TYPE]

const TYPES: readonly string[] = Object.values(WORK_ITEM_TYPE)

export function toWorkItemType(value: string): WorkItemType {
  if (!TYPES.includes(value)) {
    throw new ValidationError(`WorkItemType must be one of ${TYPES.join(', ')}`, { value })
  }
  return value as WorkItemType
}

/** Where an item sits in the hierarchy: an epic is 1, a subtask is 3. */
export type WorkItemLevel = 1 | 2 | 3

/**
 * The level each type occupies.
 *
 * The three level 2 types are peers. A bug is not filed under the story it
 * affects: a defect and the requirement it breaks reference one another, and
 * hanging the first under the second folds the cost of the defect into the
 * progress of the requirement, which is where defect statistics start to lie.
 */
export const WORK_ITEM_LEVEL = {
  [WORK_ITEM_TYPE.epic]: 1,
  [WORK_ITEM_TYPE.story]: 2,
  [WORK_ITEM_TYPE.task]: 2,
  [WORK_ITEM_TYPE.bug]: 2,
  [WORK_ITEM_TYPE.subtask]: 3,
} as const satisfies Record<WorkItemType, WorkItemLevel>

export function workItemLevel(type: WorkItemType): WorkItemLevel {
  return WORK_ITEM_LEVEL[type]
}

const SUBTASK_LEVEL = 3

/**
 * Whether an item at this level is meaningless on its own.
 *
 * Only a level 3 item is. An epic tops the hierarchy and a level 2 item is
 * deliverable by itself, but a subtask is a breakdown of something, so one
 * with nothing above it names no work anybody agreed to do.
 */
export function workItemRequiresParent(level: WorkItemLevel): boolean {
  return level === SUBTASK_LEVEL
}

const EPIC_LEVEL = 1

/**
 * The one level a sprint holds, estimates and ranks.
 *
 * An epic spans sprints, so a sprint of its own would give "which round
 * delivered this" two answers that can disagree; its estimate and progress are
 * aggregated from its children instead. A subtask is a breakdown of one level 2
 * item rather than something separately deliverable, and estimating it would
 * count the same work twice — once on the child and once on the parent —
 * inflating velocity with nothing but a finer breakdown.
 */
const PLANNABLE_LEVEL = 2

/** Whether a sprint can hold this item directly, which only level 2 can. */
export function isWorkItemPlannable(item: WorkItem): boolean {
  return item.level === PLANNABLE_LEVEL
}

export const PRIORITY = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
} as const

export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY]

const PRIORITIES: readonly string[] = Object.values(PRIORITY)

export function toPriority(value: string): Priority {
  if (!PRIORITIES.includes(value)) {
    throw new ValidationError(`Priority must be one of ${PRIORITIES.join(', ')}`, { value })
  }
  return value as Priority
}

/**
 * One condition the work has to meet. Deliberately without an identifier of
 * its own: the whole work item file is written atomically under one revision,
 * so a criterion can be addressed by position without a concurrent write
 * silently retargeting it, and the storage layout has no place to put an id
 * scheme that nothing else would use.
 */
export interface AcceptanceCriterion {
  readonly text: string
  readonly satisfied: boolean
}

/**
 * An item of work.
 *
 * Blocking is one nullable reason rather than a boolean beside a reason. Two
 * fields that must agree are two fields that will eventually disagree, and a
 * stored `blocked: true` with no reason is exactly the state the product design
 * forbids. `isWorkItemBlocked` derives the flag where a caller wants one.
 *
 * Sprint membership lives here and only here: a sprint never lists its items,
 * so moving one item is one write. A level 3 item is the documented exception
 * and holds no sprint of its own — it is read from its parent, because a stored
 * copy would eventually disagree with the parent and keeping the two in step
 * would mean rewriting every child file whenever the parent moves.
 *
 * `level` is decided by `type` and stored anyway, so that parent checks, view
 * projections and aggregation each read one integer instead of re-expanding the
 * type enum. A level added above `epic` later leaves all of them untouched.
 */
export interface WorkItem extends EntityMetadata {
  readonly id: WorkItemId
  readonly projectId: ProjectId
  readonly type: WorkItemType
  readonly level: WorkItemLevel
  readonly title: string
  readonly description: string
  readonly status: WorkItemStatus
  readonly priority: Priority
  readonly assigneeId: IdentityId | null
  readonly reporterId: IdentityId
  readonly estimate: number | null
  readonly sprintId: SprintId | null
  readonly parentId: WorkItemId | null
  readonly dependsOn: readonly WorkItemId[]
  readonly rank: Rank
  readonly blockedReason: string | null
  readonly labels: readonly string[]
  readonly acceptanceCriteria: readonly AcceptanceCriterion[]
}

export interface CreateWorkItemInput {
  readonly id: WorkItemId
  readonly projectId: ProjectId
  readonly type: WorkItemType
  /**
   * Required for a subtask and optional above it. Whether the item named here
   * really sits one level up is checked by the caller, which can read it;
   * this only settles whether one had to be named at all.
   */
  readonly parentId?: WorkItemId | null | undefined
  readonly title: string
  readonly description?: string | undefined
  readonly priority?: Priority | undefined
  readonly assigneeId?: IdentityId | null | undefined
  readonly reporterId: IdentityId
  readonly estimate?: number | null | undefined
  readonly rank: Rank
  readonly labels?: readonly string[] | undefined
  readonly acceptanceCriteria?: readonly AcceptanceCriterion[] | undefined
  readonly now: Timestamp
}

/**
 * A new item always starts in the backlog and in no sprint. Planning it into
 * one is a separate, recorded act rather than something a creation call can do
 * in passing.
 *
 * The parent is the exception: a subtask is created under one. Attaching it in
 * a second write would leave a subtask belonging to nothing on disk in between,
 * which is the one shape the hierarchy does not admit.
 */
export function createWorkItem(input: CreateWorkItemInput): WorkItem {
  return {
    ...createEntityMetadata(input.now),
    id: input.id,
    projectId: input.projectId,
    type: input.type,
    level: workItemLevel(input.type),
    title: requireText(input.title, 'Work item title', MAX_TITLE_LENGTH),
    description: requireOptionalText(
      input.description ?? '',
      'Work item description',
      MAX_DESCRIPTION_LENGTH,
    ),
    status: WORK_ITEM_STATUS.backlog,
    priority: input.priority ?? PRIORITY.medium,
    assigneeId: input.assigneeId ?? null,
    reporterId: input.reporterId,
    estimate: toLevelEstimate(input.type, toEstimate(input.estimate ?? null)),
    sprintId: null,
    parentId: toCreatedParent(input.type, input.parentId ?? null),
    dependsOn: [],
    rank: input.rank,
    blockedReason: null,
    labels: toLabels(input.labels ?? []),
    acceptanceCriteria: toAcceptanceCriteria(input.acceptanceCriteria ?? []),
  }
}

export interface WorkItemDetailChanges {
  readonly title?: string | undefined
  readonly description?: string | undefined
  readonly type?: WorkItemType | undefined
  readonly priority?: Priority | undefined
  readonly assigneeId?: IdentityId | null | undefined
  readonly estimate?: number | null | undefined
  readonly labels?: readonly string[] | undefined
  readonly acceptanceCriteria?: readonly AcceptanceCriterion[] | undefined
}

/**
 * Everything a user edits in the detail panel. Status, sprint, rank, parent,
 * dependencies and blocking are absent on purpose: each of those has a rule
 * attached and gets its own operation, so a detail edit cannot smuggle a
 * board move past the check that governs it.
 */
export function updateWorkItemDetails(
  item: WorkItem,
  changes: WorkItemDetailChanges,
  now: Timestamp,
): WorkItem {
  const type = changes.type ?? item.type
  return {
    ...item,
    ...touchEntityMetadata(item, now),
    title:
      changes.title === undefined
        ? item.title
        : requireText(changes.title, 'Work item title', MAX_TITLE_LENGTH),
    description:
      changes.description === undefined
        ? item.description
        : requireOptionalText(changes.description, 'Work item description', MAX_DESCRIPTION_LENGTH),
    type,
    level: workItemLevel(type),
    priority: changes.priority ?? item.priority,
    assigneeId: changes.assigneeId === undefined ? item.assigneeId : changes.assigneeId,
    estimate: toLevelEstimate(
      type,
      changes.estimate === undefined ? item.estimate : toEstimate(changes.estimate),
    ),
    labels: changes.labels === undefined ? item.labels : toLabels(changes.labels),
    acceptanceCriteria:
      changes.acceptanceCriteria === undefined
        ? item.acceptanceCriteria
        : toAcceptanceCriteria(changes.acceptanceCriteria),
  }
}

/**
 * Toggles one criterion by position. Position is safe to address because the
 * whole item is written under one revision: a concurrent edit that reordered
 * the list would be rejected by the revision check before this could land on
 * the wrong one.
 */
export function setAcceptanceCriterionSatisfied(
  item: WorkItem,
  index: number,
  satisfied: boolean,
  now: Timestamp,
): WorkItem {
  const criterion = item.acceptanceCriteria[index]
  if (criterion === undefined) {
    throw new ValidationError('acceptance criterion does not exist', {
      workItemId: item.id,
      index,
      count: item.acceptanceCriteria.length,
    })
  }
  return {
    ...item,
    ...touchEntityMetadata(item, now),
    acceptanceCriteria: item.acceptanceCriteria.map((existing, position) =>
      position === index ? { text: existing.text, satisfied } : existing,
    ),
  }
}

/** Whether every acceptance criterion is met, which the board shows on a card. */
export function isWorkItemAccepted(item: WorkItem): boolean {
  return (
    item.acceptanceCriteria.length > 0 &&
    item.acceptanceCriteria.every((criterion) => criterion.satisfied)
  )
}

/**
 * An estimate of zero is allowed: teams use it for work that is tracked but
 * costs nothing. A negative or fractional-to-the-point-of-noise value is not.
 */
function toCreatedParent(type: WorkItemType, parentId: WorkItemId | null): WorkItemId | null {
  if (parentId === null && workItemRequiresParent(workItemLevel(type))) {
    throw new ValidationError('a subtask is created under the item it breaks down', { type })
  }
  return parentId
}

/**
 * Keeps an estimate off the two levels that do not carry one.
 *
 * A type change that would strand an estimate is refused rather than silently
 * clearing it: the number came from a planning conversation, and a caller that
 * really means to drop it can say so by sending `estimate: null` in the same
 * change.
 */
function toLevelEstimate(type: WorkItemType, estimate: number | null): number | null {
  if (estimate !== null && workItemLevel(type) !== PLANNABLE_LEVEL) {
    throw new ValidationError('only a story, task or bug carries an estimate', { type, estimate })
  }
  return estimate
}

function toEstimate(value: number | null): number | null {
  if (value === null) {
    return null
  }
  if (!Number.isFinite(value) || value < 0 || value > MAX_ESTIMATE) {
    throw new ValidationError(`Estimate must be between 0 and ${MAX_ESTIMATE}`, { value })
  }
  return value
}

/**
 * Labels are lowercased and deduplicated, so filtering by one cannot miss
 * items that spelled it with different capitalisation.
 */
function toLabels(values: readonly string[]): readonly string[] {
  if (values.length > MAX_LABELS) {
    throw new ValidationError(`a work item may carry at most ${MAX_LABELS} labels`, {
      count: values.length,
    })
  }
  const labels = values.map((value) => requireText(value, 'Label', MAX_LABEL_LENGTH).toLowerCase())
  return [...new Set(labels)]
}

function toAcceptanceCriteria(
  criteria: readonly AcceptanceCriterion[],
): readonly AcceptanceCriterion[] {
  if (criteria.length > MAX_ACCEPTANCE_CRITERIA) {
    throw new ValidationError(
      `a work item may carry at most ${MAX_ACCEPTANCE_CRITERIA} acceptance criteria`,
      { count: criteria.length },
    )
  }
  return criteria.map((criterion) => ({
    text: requireText(criterion.text, 'Acceptance criterion', MAX_ACCEPTANCE_CRITERION_LENGTH),
    satisfied: criterion.satisfied,
  }))
}

/**
 * An item is in the backlog exactly when it belongs to no sprint. Tying the
 * two together makes both documented invariants structural rather than checks
 * somebody has to remember: a backlog item cannot be in an active sprint
 * because it is in no sprint at all, and an unfinished item in a sprint can
 * only be `todo`, `in_progress` or `review` because those are the remaining
 * statuses. Neither rule needs to read the sprint, which the work item cannot
 * see anyway.
 *
 * The sprint is passed in rather than read off the item, because a level 3 item
 * holds none of its own and belongs to whichever sprint its parent is in.
 */
function assertInASprint(item: WorkItem, sprintId: SprintId | null, action: string): void {
  if (sprintId === null) {
    throw new ValidationError(`a backlog item cannot ${action}`, {
      workItemId: item.id,
      status: item.status,
    })
  }
}

/** Refuses the two levels a sprint does not hold, naming the type it refused. */
function assertPlannable(item: WorkItem, action: string): void {
  if (!isWorkItemPlannable(item)) {
    throw new ValidationError(`only a story, task or bug can ${action}`, {
      workItemId: item.id,
      type: item.type,
    })
  }
}

/**
 * Moves an item between the board columns. Reaching `backlog` is not a status
 * move but a removal from the sprint, so it has its own operation; letting it
 * happen here would leave an item in the backlog still pointing at a sprint.
 *
 * `effectiveSprintId` defaults to the item's own and is supplied only for a
 * level 3 item, whose board is its parent's. The caller resolves it, because
 * the domain cannot read another item from here.
 */
export function moveWorkItemStatus(
  item: WorkItem,
  status: WorkItemStatus,
  now: Timestamp,
  effectiveSprintId: SprintId | null = item.sprintId,
): WorkItem {
  if (status === WORK_ITEM_STATUS.backlog) {
    throw new ValidationError('returning an item to the backlog removes it from its sprint', {
      workItemId: item.id,
    })
  }
  if (item.level === EPIC_LEVEL) {
    throw new ValidationError('an epic advances through its children', {
      workItemId: item.id,
      status,
    })
  }
  assertInASprint(item, effectiveSprintId, 'move across the board')
  if (item.status === status) {
    throw new ValidationError(`item is already ${status}`, { workItemId: item.id, status })
  }
  return { ...item, ...touchEntityMetadata(item, now), status }
}

/**
 * Plans an item into a sprint. An item still in the backlog enters as `todo`;
 * one already being worked on keeps the column it is in, so moving a card
 * between sprints does not silently reset its progress.
 */
export function assignWorkItemToSprint(
  item: WorkItem,
  sprintId: SprintId,
  now: Timestamp,
): WorkItem {
  assertPlannable(item, 'be planned into a sprint')
  if (item.sprintId === sprintId) {
    throw new ValidationError('item is already in this sprint', {
      workItemId: item.id,
      sprintId,
    })
  }
  return {
    ...item,
    ...touchEntityMetadata(item, now),
    sprintId,
    status: item.status === WORK_ITEM_STATUS.backlog ? WORK_ITEM_STATUS.todo : item.status,
  }
}

/**
 * Returns an unfinished item to the backlog, which is how closing a sprint
 * disposes of work that did not land. A finished item is refused: its sprint
 * is the record of where it was delivered, and dropping that silently rewrites
 * the history the sprint report reads.
 */
export function removeWorkItemFromSprint(item: WorkItem, now: Timestamp): WorkItem {
  assertPlannable(item, 'leave a sprint')
  assertInASprint(item, item.sprintId, 'leave a sprint')
  if (item.status === WORK_ITEM_STATUS.done) {
    throw new ValidationError('a finished item keeps the sprint that delivered it', {
      workItemId: item.id,
      sprintId: item.sprintId,
    })
  }
  return {
    ...item,
    ...touchEntityMetadata(item, now),
    sprintId: null,
    status: WORK_ITEM_STATUS.backlog,
  }
}

export function isWorkItemBlocked(item: WorkItem): boolean {
  return item.blockedReason !== null
}

/** Whether the item counts as delivered, which sprint progress and closing read. */
export function isWorkItemFinished(item: WorkItem): boolean {
  return item.status === WORK_ITEM_STATUS.done
}

/**
 * Blocking always carries a reason. A block nobody explained is one nobody can
 * act on, and it is the state a stand-up is supposed to surface.
 */
export function blockWorkItem(item: WorkItem, reason: string, now: Timestamp): WorkItem {
  const blockedReason = requireText(reason, 'Blocked reason', MAX_BLOCKED_REASON_LENGTH)
  if (item.blockedReason === blockedReason) {
    throw new ValidationError('item is already blocked for this reason', {
      workItemId: item.id,
      blockedReason,
    })
  }
  return { ...item, ...touchEntityMetadata(item, now), blockedReason }
}

export function unblockWorkItem(item: WorkItem, now: Timestamp): WorkItem {
  if (!isWorkItemBlocked(item)) {
    throw new ValidationError('item is not blocked', { workItemId: item.id })
  }
  return { ...item, ...touchEntityMetadata(item, now), blockedReason: null }
}

/**
 * Reorders one item. The caller computes the rank from the neighbours it is
 * dropped between, so a reorder writes this file and no other.
 */
export function moveWorkItemRank(item: WorkItem, rank: Rank, now: Timestamp): WorkItem {
  if (item.rank === rank) {
    throw new ValidationError('item already holds this rank', { workItemId: item.id, rank })
  }
  return { ...item, ...touchEntityMetadata(item, now), rank }
}
