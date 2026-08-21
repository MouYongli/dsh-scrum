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
 * but never renamed; the product design already names Feature and Spike as
 * later additions.
 */
export const WORK_ITEM_TYPE = {
  epic: 'epic',
  story: 'story',
  task: 'task',
  bug: 'bug',
} as const

export type WorkItemType = (typeof WORK_ITEM_TYPE)[keyof typeof WORK_ITEM_TYPE]

const TYPES: readonly string[] = Object.values(WORK_ITEM_TYPE)

export function toWorkItemType(value: string): WorkItemType {
  if (!TYPES.includes(value)) {
    throw new ValidationError(`WorkItemType must be one of ${TYPES.join(', ')}`, { value })
  }
  return value as WorkItemType
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
 * so moving one item is one write.
 */
export interface WorkItem extends EntityMetadata {
  readonly id: WorkItemId
  readonly projectId: ProjectId
  readonly type: WorkItemType
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
 */
export function createWorkItem(input: CreateWorkItemInput): WorkItem {
  return {
    ...createEntityMetadata(input.now),
    id: input.id,
    projectId: input.projectId,
    type: input.type,
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
    estimate: toEstimate(input.estimate ?? null),
    sprintId: null,
    parentId: null,
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
    type: changes.type ?? item.type,
    priority: changes.priority ?? item.priority,
    assigneeId: changes.assigneeId === undefined ? item.assigneeId : changes.assigneeId,
    estimate: changes.estimate === undefined ? item.estimate : toEstimate(changes.estimate),
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
 */
function assertInASprint(item: WorkItem, action: string): SprintId {
  if (item.sprintId === null) {
    throw new ValidationError(`a backlog item cannot ${action}`, {
      workItemId: item.id,
      status: item.status,
    })
  }
  return item.sprintId
}

/**
 * Moves an item between the board columns. Reaching `backlog` is not a status
 * move but a removal from the sprint, so it has its own operation; letting it
 * happen here would leave an item in the backlog still pointing at a sprint.
 */
export function moveWorkItemStatus(
  item: WorkItem,
  status: WorkItemStatus,
  now: Timestamp,
): WorkItem {
  if (status === WORK_ITEM_STATUS.backlog) {
    throw new ValidationError('returning an item to the backlog removes it from its sprint', {
      workItemId: item.id,
    })
  }
  assertInASprint(item, 'move across the board')
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
  assertInASprint(item, 'leave a sprint')
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
