import { compareRanks, type WorkItem } from '@dsh-scrum/scrum-domain'
import type { MessageKey } from './messages.js'

/**
 * A column of the work item list.
 *
 * `rank` is the product owner's order and the one the list opens in. The rest
 * are the questions somebody scans a list to answer, and each says how it
 * sorts rather than leaving the table to guess from the rendered text — a
 * column of estimates sorted as text puts 10 before 2.
 */
export const LIST_COLUMN = {
  rank: 'rank',
  id: 'id',
  title: 'title',
  type: 'type',
  category: 'category',
  status: 'status',
  priority: 'priority',
  assignee: 'assignee',
  estimate: 'estimate',
  sprint: 'sprint',
  updated: 'updated',
} as const

export type ListColumn = (typeof LIST_COLUMN)[keyof typeof LIST_COLUMN]

export type SortDirection = 'ascending' | 'descending'

export interface ListSort {
  readonly column: ListColumn
  readonly direction: SortDirection
}

export const DEFAULT_SORT: ListSort = { column: LIST_COLUMN.rank, direction: 'ascending' }

/** The order the columns are drawn in, and what each is called. */
export const LIST_COLUMNS: readonly { readonly column: ListColumn; readonly label: MessageKey }[] =
  [
    { column: LIST_COLUMN.id, label: 'list.column.id' },
    { column: LIST_COLUMN.title, label: 'list.column.title' },
    { column: LIST_COLUMN.type, label: 'item.type' },
    { column: LIST_COLUMN.category, label: 'item.category' },
    { column: LIST_COLUMN.status, label: 'list.column.status' },
    { column: LIST_COLUMN.priority, label: 'item.priority' },
    { column: LIST_COLUMN.assignee, label: 'list.column.assignee' },
    { column: LIST_COLUMN.estimate, label: 'item.estimate' },
    { column: LIST_COLUMN.sprint, label: 'list.column.sprint' },
    { column: LIST_COLUMN.updated, label: 'list.column.updated' },
  ]

/**
 * What one column compares by.
 *
 * `null` sorts last in both directions rather than at one end: an unestimated
 * item is not smaller than a one-point item, it is an item nobody sized, and
 * burying those at the top of an ascending sort would hide the sized work
 * somebody opened the column to see.
 */
function valueOf(item: WorkItem, column: ListColumn): string | number | null {
  switch (column) {
    case LIST_COLUMN.rank:
      return null
    case LIST_COLUMN.id:
      return item.id
    case LIST_COLUMN.title:
      return item.title
    case LIST_COLUMN.type:
      return item.level * 10 + item.type.charCodeAt(0)
    case LIST_COLUMN.category:
      return item.category
    case LIST_COLUMN.status:
      return item.status
    case LIST_COLUMN.priority:
      return item.priority
    case LIST_COLUMN.assignee:
      return item.assigneeId
    case LIST_COLUMN.estimate:
      return item.estimate
    case LIST_COLUMN.sprint:
      return item.sprintId
    case LIST_COLUMN.updated:
      return item.updatedAt
  }
}

function compare(left: string | number | null, right: string | number | null): number {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right))
}

/**
 * The rows in the order the list draws them.
 *
 * Rank order is the fallback for every tie as well as the default column, so
 * two items a sort cannot separate stay in the order the product owner put
 * them in rather than in whatever order they were read.
 *
 * A `null` never flips to the front when the direction reverses: the reversal
 * is applied to the comparison, not to the "no value last" rule.
 */
export function sortWorkItems(items: readonly WorkItem[], sort: ListSort): readonly WorkItem[] {
  const factor = sort.direction === 'ascending' ? 1 : -1
  return [...items].sort((left, right) => {
    const leftValue = valueOf(left, sort.column)
    const rightValue = valueOf(right, sort.column)
    if (leftValue === null && rightValue !== null) return 1
    if (rightValue === null && leftValue !== null) return -1
    const ordered = compare(leftValue, rightValue) * factor
    return ordered === 0 ? compareRanks(left.rank, right.rank) : ordered
  })
}

/** Clicking the column already sorted reverses it; any other starts ascending. */
export function nextSort(current: ListSort, column: ListColumn): ListSort {
  if (current.column !== column) {
    return { column, direction: 'ascending' }
  }
  return {
    column,
    direction: current.direction === 'ascending' ? 'descending' : 'ascending',
  }
}
