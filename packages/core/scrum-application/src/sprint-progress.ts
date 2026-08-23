import {
  DEFAULT_WORKFLOW_STATUSES,
  WORK_ITEM_RESOLUTION,
  isWorkItemFinished,
  type SprintId,
  type WorkItem,
  type WorkItemId,
  type WorkItemStatus,
} from '@dsh-scrum/scrum-domain'
import type { SprintBaseline } from './ports/sprint-progress-log.js'

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
 *
 * `finished` and `delivered` are both reported, and they are not the same
 * question. Everything at `done` has left the board; only some of it was
 * delivered, and the rest was dropped, deduplicated or never reproduced.
 * Velocity is a claim about what a team can deliver, so it reads the second —
 * a team that closed a sprint by abandoning half of it did not get faster.
 */
export interface SprintProgress {
  readonly sprintId: SprintId
  readonly byStatus: Readonly<Record<WorkItemStatus, StatusTotals>>
  readonly total: StatusTotals
  /** Everything that left the board, however it ended. */
  readonly finished: StatusTotals
  /** The part of `finished` that ended as done. */
  readonly delivered: StatusTotals
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
  let delivered: StatusTotals = { count: 0, estimate: 0 }
  let unestimated = 0

  for (const item of items) {
    if (item.sprintId !== sprintId) {
      continue
    }
    byStatus[item.status] = add(byStatus[item.status], item)
    total = add(total, item)
    if (isWorkItemFinished(item)) {
      finished = add(finished, item)
      if (item.resolution === WORK_ITEM_RESOLUTION.done) {
        delivered = add(delivered, item)
      }
    }
    if (item.estimate === null) {
      unestimated += 1
    }
  }
  return { sprintId, byStatus, total, finished, delivered, unestimated }
}

/** What the sprint holds now against what it opened with. */
export interface SprintScopeChange {
  readonly sprintId: SprintId
  /** In the sprint now, absent from the baseline. */
  readonly added: readonly WorkItemId[]
  /** In the baseline, gone from the sprint now. */
  readonly removed: readonly WorkItemId[]
  /** The points committed at the start, for the burndown to begin from. */
  readonly committedPoints: number
}

/**
 * The difference between what a sprint committed to and what it holds now.
 *
 * Both directions, because both are things a review has to explain: work that
 * arrived after the start, and work that was taken out. Reporting only the
 * first would let a sprint quietly shed half its commitment and still read as
 * having grown.
 *
 * Items of another sprint or of none are ignored rather than rejected, so a
 * caller can hand over everything it already read.
 */
export function sprintScopeChange(
  baseline: SprintBaseline,
  items: Iterable<WorkItem>,
): SprintScopeChange {
  const committed = new Set<WorkItemId>(baseline.itemIds)
  const now = new Set<WorkItemId>()
  for (const item of items) {
    if (item.sprintId === baseline.sprintId) {
      now.add(item.id)
    }
  }
  return {
    sprintId: baseline.sprintId,
    added: [...now].filter((id) => !committed.has(id)),
    removed: baseline.itemIds.filter((id) => !now.has(id)),
    committedPoints: baseline.totalPoints,
  }
}
