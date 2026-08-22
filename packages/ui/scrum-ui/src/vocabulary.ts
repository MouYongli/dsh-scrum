import {
  BOARD_STATUSES,
  PRIORITY,
  SPRINT_STATUS,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  type Priority,
  type SprintStatus,
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
}

const PRIORITY_LABEL: Readonly<Record<Priority, MessageKey>> = {
  [PRIORITY.critical]: 'priority.critical',
  [PRIORITY.high]: 'priority.high',
  [PRIORITY.medium]: 'priority.medium',
  [PRIORITY.low]: 'priority.low',
}

export function typeLabel(type: WorkItemType): MessageKey {
  return TYPE_LABEL[type]
}

export function priorityLabel(priority: Priority): MessageKey {
  return PRIORITY_LABEL[priority]
}

/** The order the vocabulary is offered in, which is the domain's own. */
export const WORK_ITEM_TYPES: readonly WorkItemType[] = Object.values(WORK_ITEM_TYPE)

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
