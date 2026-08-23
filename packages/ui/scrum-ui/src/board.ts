import {
  WORK_ITEM_STATUS,
  isWorkItemBlocked,
  isWorkItemFinished,
  type WorkItem,
  type WorkItemResolution,
  type WorkItemStatus,
} from '@dsh-scrum/scrum-domain'
import type { GroupTotals } from './backlog.js'
import type { MessageKey } from './messages.js'
import { BOARD_COLUMNS, WORK_ITEM_RESOLUTIONS, resolutionLabel, statusLabel } from './vocabulary.js'

export interface BoardCard {
  readonly item: WorkItem
  readonly blocked: boolean
  readonly criteria: { readonly satisfied: number; readonly total: number }
}

export interface BoardColumn {
  readonly status: WorkItemStatus
  readonly cards: readonly BoardCard[]
  readonly totals: GroupTotals
}

/**
 * A sprint, as the board draws it.
 *
 * Aggregated from the items on screen rather than read as a second number.
 * The application already derives `SprintProgress` for the agent surface; what
 * a board needs is the totals of exactly the cards it is showing, and a figure
 * fetched separately could disagree with them between two reads — which is the
 * one thing a person checks a board for.
 */
export interface BoardView {
  readonly columns: readonly BoardColumn[]
  readonly total: GroupTotals
  readonly finished: GroupTotals
  /**
   * Items assigned to the sprint that no column shows. Reported rather than
   * dropped: a card nobody can see is worse than a number nobody expected.
   */
  readonly hidden: number
}

function cardOf(item: WorkItem): BoardCard {
  return {
    item,
    blocked: isWorkItemBlocked(item),
    criteria: {
      satisfied: item.acceptanceCriteria.filter((criterion) => criterion.satisfied).length,
      total: item.acceptanceCriteria.length,
    },
  }
}

function totalsOf(items: readonly WorkItem[]): GroupTotals {
  return {
    count: items.length,
    estimate: items.reduce((sum, item) => sum + (item.estimate ?? 0), 0),
    unestimated: items.filter((item) => item.estimate === null).length,
  }
}

/**
 * Every column is drawn, including the empty ones. A board whose columns
 * appeared and vanished with their contents would move under the pointer
 * exactly as work started arriving in them.
 */
export function boardView(items: readonly WorkItem[]): BoardView {
  const columns = BOARD_COLUMNS.map((status) => {
    const inColumn = items.filter((item) => item.status === status)
    return { status, cards: inColumn.map(cardOf), totals: totalsOf(inColumn) }
  })
  return {
    columns,
    total: totalsOf(items),
    finished: totalsOf(items.filter(isWorkItemFinished)),
    hidden: items.filter((item) => !BOARD_COLUMNS.includes(item.status)).length,
  }
}

/** Somewhere a card can be moved to, and how the work ended if that is it. */
export interface MoveTarget {
  readonly key: string
  readonly status: WorkItemStatus
  readonly resolution: WorkItemResolution | null
  readonly label: MessageKey
}

/**
 * Where one card may go next.
 *
 * Every other column, not only the neighbouring one: work goes back to review
 * as often as it goes forward, and a board that only moved rightwards would be
 * describing a process nobody runs.
 *
 * The last column is offered once per way of ending rather than once. Every
 * other answer — a dialog after the move, or a silent default corrected later
 * — either interrupts the ordinary case or records "delivered" for work that
 * was abandoned. Listing them costs the same one choice the board already
 * asked for, and the common answer sits where the single entry used to.
 */
export function moveTargets(status: WorkItemStatus): readonly MoveTarget[] {
  const targets = everyMoveTarget().filter((target) => target.status !== status)
  // A card already finished offers only the way back. Restating how something
  // ended is a different act from finishing it, and it belongs where the rest
  // of an item's fields are edited rather than on a card.
  return status === WORK_ITEM_STATUS.done
    ? targets.filter((target) => target.resolution === null)
    : targets
}

/**
 * Every destination there is, with no card in mind.
 *
 * What a batch needs: the selection spans several columns, so there is no one
 * column to leave out, and a list assembled from the first marked row would
 * quietly refuse the move for every row already in it.
 */
export function everyMoveTarget(): readonly MoveTarget[] {
  const columns = BOARD_COLUMNS.filter((column) => column !== WORK_ITEM_STATUS.done).map(
    (column) => ({
      key: column,
      status: column,
      resolution: null,
      label: statusLabel(column),
    }),
  )
  const endings = WORK_ITEM_RESOLUTIONS.map((resolution) => ({
    key: `${WORK_ITEM_STATUS.done}:${resolution}`,
    status: WORK_ITEM_STATUS.done,
    resolution,
    label: resolutionLabel(resolution),
  }))
  return [...columns, ...endings]
}
