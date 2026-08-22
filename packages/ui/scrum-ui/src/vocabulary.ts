import { PRIORITY, WORK_ITEM_TYPE, type Priority, type WorkItemType } from '@dsh-scrum/scrum-domain'
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
