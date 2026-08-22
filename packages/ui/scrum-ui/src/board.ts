import {
  isWorkItemBlocked,
  isWorkItemFinished,
  type WorkItem,
  type WorkItemStatus,
} from '@dsh-scrum/scrum-domain'
import type { GroupTotals } from './backlog.js'
import { BOARD_COLUMNS } from './vocabulary.js'

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

/**
 * Where one card may go next.
 *
 * Every other column, not only the neighbouring one: work goes back to review
 * as often as it goes forward, and a board that only moved rightwards would be
 * describing a process nobody runs.
 */
export function moveTargets(status: WorkItemStatus): readonly WorkItemStatus[] {
  return BOARD_COLUMNS.filter((column) => column !== status)
}
