import {
  DEFAULT_WORKFLOW_STATUSES,
  isWorkItemFinished,
  type SprintId,
  type WorkItem,
  type WorkItemStatus,
} from '@dsh-scrum/scrum-domain'

export interface StatusTotals {
  readonly count: number
  readonly estimate: number
}

/**
 * What a sprint looks like right now.
 *
 * Derived on every read and never stored. A stored total is a second copy of
 * something the items already say, and the moment one write updates the items
 * without updating the total, the board is confidently wrong.
 *
 * `unestimated` is reported next to the estimate rather than folded into it.
 * An estimate total that silently omits the items nobody sized reads as a
 * complete number and is not one.
 */
export interface SprintProgress {
  readonly sprintId: SprintId
  readonly byStatus: Readonly<Record<WorkItemStatus, StatusTotals>>
  readonly total: StatusTotals
  readonly finished: StatusTotals
  readonly unestimated: number
}

function emptyTotals(): Record<WorkItemStatus, StatusTotals> {
  const totals = {} as Record<WorkItemStatus, StatusTotals>
  for (const status of DEFAULT_WORKFLOW_STATUSES) {
    totals[status] = { count: 0, estimate: 0 }
  }
  return totals
}

function add(totals: StatusTotals, item: WorkItem): StatusTotals {
  return { count: totals.count + 1, estimate: totals.estimate + (item.estimate ?? 0) }
}

/**
 * Aggregates the items assigned to one sprint. Items belonging to another
 * sprint or to none are ignored rather than rejected, so a caller can hand
 * over everything it already read.
 */
export function sprintProgress(sprintId: SprintId, items: Iterable<WorkItem>): SprintProgress {
  const byStatus = emptyTotals()
  let total: StatusTotals = { count: 0, estimate: 0 }
  let finished: StatusTotals = { count: 0, estimate: 0 }
  let unestimated = 0

  for (const item of items) {
    if (item.sprintId !== sprintId) {
      continue
    }
    byStatus[item.status] = add(byStatus[item.status], item)
    total = add(total, item)
    if (isWorkItemFinished(item)) {
      finished = add(finished, item)
    }
    if (item.estimate === null) {
      unestimated += 1
    }
  }
  return { sprintId, byStatus, total, finished, unestimated }
}
