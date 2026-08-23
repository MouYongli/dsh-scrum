import {
  BOARD_STATUSES,
  BUG_SEVERITY,
  PRIORITY,
  SPRINT_STATUS,
  WORK_ITEM_CATEGORY,
  WORK_ITEM_RESOLUTION,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  recommendedTypeFor,
  type BugSeverity,
  type Priority,
  type SprintStatus,
  type WorkItemCategory,
  type WorkItemResolution,
  type WorkItemStatus,
  type WorkItemType,
} from '@dsh-scrum/scrum-domain'
import type { MessageKey } from './messages.js'

/**
 * How the interface names the domain's words.
 *
 * A total record rather than a lookup with a fallback: a type or priority
 * added to the domain without a name here fails to compile, instead of
 * reaching a user as its raw stored spelling.
 */
const TYPE_LABEL: Readonly<Record<WorkItemType, MessageKey>> = {
  [WORK_ITEM_TYPE.epic]: 'type.epic',
  [WORK_ITEM_TYPE.story]: 'type.story',
  [WORK_ITEM_TYPE.task]: 'type.task',
  [WORK_ITEM_TYPE.bug]: 'type.bug',
  [WORK_ITEM_TYPE.subtask]: 'type.subtask',
}

const PRIORITY_LABEL: Readonly<Record<Priority, MessageKey>> = {
  [PRIORITY.critical]: 'priority.critical',
  [PRIORITY.high]: 'priority.high',
  [PRIORITY.medium]: 'priority.medium',
  [PRIORITY.low]: 'priority.low',
}

const CATEGORY_LABEL: Readonly<Record<WorkItemCategory, MessageKey>> = {
  [WORK_ITEM_CATEGORY.feature]: 'category.feature',
  [WORK_ITEM_CATEGORY.nfrVisible]: 'category.nfrVisible',
  [WORK_ITEM_CATEGORY.nfrConstraint]: 'category.nfrConstraint',
  [WORK_ITEM_CATEGORY.techDebt]: 'category.techDebt',
  [WORK_ITEM_CATEGORY.spike]: 'category.spike',
  [WORK_ITEM_CATEGORY.ops]: 'category.ops',
  [WORK_ITEM_CATEGORY.docs]: 'category.docs',
  [WORK_ITEM_CATEGORY.defect]: 'category.defect',
}

const RESOLUTION_LABEL: Readonly<Record<WorkItemResolution, MessageKey>> = {
  [WORK_ITEM_RESOLUTION.done]: 'resolution.done',
  [WORK_ITEM_RESOLUTION.wontFix]: 'resolution.wontFix',
  [WORK_ITEM_RESOLUTION.duplicate]: 'resolution.duplicate',
  [WORK_ITEM_RESOLUTION.cannotReproduce]: 'resolution.cannotReproduce',
}

const SEVERITY_LABEL: Readonly<Record<BugSeverity, MessageKey>> = {
  [BUG_SEVERITY.blocker]: 'severity.blocker',
  [BUG_SEVERITY.major]: 'severity.major',
  [BUG_SEVERITY.minor]: 'severity.minor',
  [BUG_SEVERITY.trivial]: 'severity.trivial',
}

export function typeLabel(type: WorkItemType): MessageKey {
  return TYPE_LABEL[type]
}

/**
 * The three vocabularies that admit "nobody said".
 *
 * Unset is named rather than shown as a blank. A row with an empty cell reads
 * as a rendering fault; one that says it is unclassified reads as a fact about
 * the item, which is what it is.
 */
export function categoryLabel(category: WorkItemCategory | null): MessageKey {
  return category === null ? 'category.none' : CATEGORY_LABEL[category]
}

export function resolutionLabel(resolution: WorkItemResolution): MessageKey {
  return RESOLUTION_LABEL[resolution]
}

export function severityLabel(severity: BugSeverity | null): MessageKey {
  return severity === null ? 'severity.none' : SEVERITY_LABEL[severity]
}

export function priorityLabel(priority: Priority): MessageKey {
  return PRIORITY_LABEL[priority]
}

/** The order the vocabulary is offered in, which is the domain's own. */
export const WORK_ITEM_TYPES: readonly WorkItemType[] = Object.values(WORK_ITEM_TYPE)

/**
 * The categories, grouped by the type each suggests.
 *
 * The order is the one the product document lists them in, which reads down
 * from what a user asks for to what only the team sees. A list sorted by the
 * stored spelling would put documentation between technical debt and features
 * for no reason a reader could follow.
 */
export const WORK_ITEM_CATEGORIES: readonly WorkItemCategory[] = [
  WORK_ITEM_CATEGORY.feature,
  WORK_ITEM_CATEGORY.nfrVisible,
  WORK_ITEM_CATEGORY.nfrConstraint,
  WORK_ITEM_CATEGORY.techDebt,
  WORK_ITEM_CATEGORY.spike,
  WORK_ITEM_CATEGORY.ops,
  WORK_ITEM_CATEGORY.docs,
  WORK_ITEM_CATEGORY.defect,
]

export const WORK_ITEM_RESOLUTIONS: readonly WorkItemResolution[] = [
  WORK_ITEM_RESOLUTION.done,
  WORK_ITEM_RESOLUTION.wontFix,
  WORK_ITEM_RESOLUTION.duplicate,
  WORK_ITEM_RESOLUTION.cannotReproduce,
]

/** Worst first, the way a triage list is read. */
export const BUG_SEVERITIES: readonly BugSeverity[] = [
  BUG_SEVERITY.blocker,
  BUG_SEVERITY.major,
  BUG_SEVERITY.minor,
  BUG_SEVERITY.trivial,
]

export { recommendedTypeFor }

/**
 * Most urgent first, which is not the order the domain declares them in. The
 * domain's order is a vocabulary; a list read top down has to put the work
 * that matters at the top.
 */
export const PRIORITIES: readonly Priority[] = [
  PRIORITY.critical,
  PRIORITY.high,
  PRIORITY.medium,
  PRIORITY.low,
]

const STATUS_LABEL: Readonly<Record<WorkItemStatus, MessageKey>> = {
  [WORK_ITEM_STATUS.backlog]: 'status.backlog',
  [WORK_ITEM_STATUS.todo]: 'status.todo',
  [WORK_ITEM_STATUS.inProgress]: 'status.inProgress',
  [WORK_ITEM_STATUS.review]: 'status.review',
  [WORK_ITEM_STATUS.done]: 'status.done',
}

const SPRINT_STATUS_LABEL: Readonly<Record<SprintStatus, MessageKey>> = {
  [SPRINT_STATUS.planned]: 'sprint.status.planned',
  [SPRINT_STATUS.active]: 'sprint.status.active',
  [SPRINT_STATUS.closed]: 'sprint.status.closed',
}

export function statusLabel(status: WorkItemStatus): MessageKey {
  return STATUS_LABEL[status]
}

export function sprintStatusLabel(status: SprintStatus): MessageKey {
  return SPRINT_STATUS_LABEL[status]
}

/**
 * The board's columns, in workflow order.
 *
 * The domain's `BOARD_STATUSES` is the work-in-progress view — what a WIP
 * limit counts — and stops before `done`. A board has to draw `done` too,
 * because it is where the work is moved to; drawing the order from the domain
 * and appending the one column it deliberately leaves out keeps the order in
 * one place. `backlog` is absent for the domain's own reason: an item in the
 * backlog is by definition not in the sprint.
 */
export const BOARD_COLUMNS: readonly WorkItemStatus[] = [...BOARD_STATUSES, WORK_ITEM_STATUS.done]
