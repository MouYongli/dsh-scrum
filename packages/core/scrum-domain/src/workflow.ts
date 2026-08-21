import { ValidationError } from './errors.js'

/**
 * The status vocabulary every work item moves through. The string values are
 * persisted in `work-items/<id>.json` and named by the API contract and the
 * board columns, so they may be added to but never renamed.
 *
 * This module fixes the vocabulary and its order only. Which transitions are
 * legal is a work item rule and lands with that aggregate: putting it here
 * would force the workflow to know about assignees, sprints and blocking.
 */
export const WORK_ITEM_STATUS = {
  backlog: 'backlog',
  todo: 'todo',
  inProgress: 'in_progress',
  review: 'review',
  done: 'done',
} as const

export type WorkItemStatus = (typeof WORK_ITEM_STATUS)[keyof typeof WORK_ITEM_STATUS]

/**
 * The default workflow, in the order work advances. The order is data, not a
 * rendering detail: progress aggregation and the board column layout both read
 * it, and a project that renames a status must not be able to reorder it.
 */
export const DEFAULT_WORKFLOW_STATUSES: readonly WorkItemStatus[] = [
  WORK_ITEM_STATUS.backlog,
  WORK_ITEM_STATUS.todo,
  WORK_ITEM_STATUS.inProgress,
  WORK_ITEM_STATUS.review,
  WORK_ITEM_STATUS.done,
]

/**
 * The columns a sprint board shows. `backlog` is excluded because an item in
 * the backlog is by definition not in the sprint, and `done` is excluded from
 * the work-in-progress view for the same reason the WIP limit ignores it.
 */
export const BOARD_STATUSES: readonly WorkItemStatus[] = [
  WORK_ITEM_STATUS.todo,
  WORK_ITEM_STATUS.inProgress,
  WORK_ITEM_STATUS.review,
]

const STATUSES: readonly string[] = DEFAULT_WORKFLOW_STATUSES

export function toWorkItemStatus(value: string): WorkItemStatus {
  if (!STATUSES.includes(value)) {
    throw new ValidationError(`WorkItemStatus must be one of ${STATUSES.join(', ')}`, { value })
  }
  return value as WorkItemStatus
}

export function isBoardStatus(status: WorkItemStatus): boolean {
  return BOARD_STATUSES.includes(status)
}

/** Position in the ordered workflow, so callers can compare progress. */
export function statusRank(status: WorkItemStatus): number {
  return DEFAULT_WORKFLOW_STATUSES.indexOf(status)
}
