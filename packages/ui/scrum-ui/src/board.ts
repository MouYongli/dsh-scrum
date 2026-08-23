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
  /**
   * The limit this column is held to, or null where none applies.
   *
   * Null on the first and last columns whatever the project set: a backlog is
   * a queue and a finished pile is a record, and limiting either would be
   * limiting the wrong thing. A limit is about how much is under way at once.
   */
  readonly limit: number | null
  readonly overLimit: boolean
}

/** How a board is split into rows. */
export const BOARD_LANE = {
  none: 'none',
  assignee: 'assignee',
  epic: 'epic',
} as const

export type BoardLane = (typeof BOARD_LANE)[keyof typeof BOARD_LANE]

export interface BoardSwimlane {
  /**
   * `all` for the single lane of an ungrouped board, `none` for the work with
   * no owner or no epic, and otherwise the identifier grouped on. The renderer
   * reads this rather than the label: the first two need copy of their own,
   * and only it knows how to translate.
   */
  readonly key: string
  /** Null for `all` and `none`, which the renderer names for itself. */
  readonly label: string | null
  readonly columns: readonly BoardColumn[]
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
  /**
   * The board split into rows. Always at least one, so the renderer has one
   * shape to draw rather than a grouped branch and an ungrouped one.
   */
  readonly lanes: readonly BoardSwimlane[]
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
export interface BoardOptions {
  /** The project's limit, or null when it has not set one. */
  readonly limit?: number | null | undefined
  readonly lane?: BoardLane | undefined
  /**
   * Titles for the epics the cards belong to, so a lane can be headed by a
   * name rather than an identifier. An epic the filter left out simply keeps
   * its identifier.
   */
  readonly epicTitles?: ReadonlyMap<string, string> | undefined
}

/**
 * Which columns a work-in-progress limit governs.
 *
 * Everything between the first and the last. A limit exists to stop a team
 * starting more than it can finish, and neither the queue in front nor the
 * pile behind is work in progress.
 */
function limitFor(status: WorkItemStatus, limit: number | null): number | null {
  if (limit === null) {
    return null
  }
  const first = BOARD_COLUMNS[0]
  const last = BOARD_COLUMNS[BOARD_COLUMNS.length - 1]
  return status === first || status === last ? null : limit
}

function columnsOf(items: readonly WorkItem[], limit: number | null): readonly BoardColumn[] {
  return BOARD_COLUMNS.map((status) => {
    const inColumn = items.filter((item) => item.status === status)
    const columnLimit = limitFor(status, limit)
    return {
      status,
      cards: inColumn.map(cardOf),
      totals: totalsOf(inColumn),
      limit: columnLimit,
      overLimit: columnLimit !== null && inColumn.length > columnLimit,
    }
  })
}

/**
 * Every column is drawn, including the empty ones. A board whose columns
 * appeared and vanished with their contents would move under the pointer
 * exactly as work started arriving in them.
 */
export function boardView(items: readonly WorkItem[], options: BoardOptions = {}): BoardView {
  const limit = options.limit ?? null
  return {
    columns: columnsOf(items, limit),
    lanes: swimlanes(items, limit, options),
    total: totalsOf(items),
    finished: totalsOf(items.filter(isWorkItemFinished)),
    hidden: items.filter((item) => !BOARD_COLUMNS.includes(item.status)).length,
  }
}

/**
 * The lanes, in a stable order with the unattributed one last.
 *
 * "Nobody" and "no epic" are lanes rather than omissions: work with no owner
 * is exactly what a lane view is being opened to find, and dropping it would
 * make the board disagree with its own totals.
 */
function swimlanes(
  items: readonly WorkItem[],
  limit: number | null,
  options: BoardOptions,
): readonly BoardSwimlane[] {
  const lane = options.lane ?? BOARD_LANE.none
  if (lane === BOARD_LANE.none) {
    return [{ key: 'all', label: null, columns: columnsOf(items, limit) }]
  }
  const keyOf = (item: WorkItem): string =>
    (lane === BOARD_LANE.assignee ? item.assigneeId : item.parentId) ?? ''
  const keys = [...new Set(items.map(keyOf))].sort()
  // The empty key sorts first as a string and belongs last as a lane: it is
  // the leftovers, and a board that opened with them would bury the people.
  const ordered = [...keys.filter((key) => key !== ''), ...keys.filter((key) => key === '')]
  return ordered.map((key) => ({
    key: key === '' ? 'none' : key,
    label: key === '' ? null : (options.epicTitles?.get(key) ?? key),
    columns: columnsOf(
      items.filter((item) => keyOf(item) === key),
      limit,
    ),
  }))
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
