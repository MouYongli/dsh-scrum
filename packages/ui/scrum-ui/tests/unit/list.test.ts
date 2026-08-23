import { describe, expect, it } from 'vitest'
import { PRIORITY, WORK_ITEM_STATUS, WORK_ITEM_TYPE } from '@dsh-scrum/scrum-domain'
import { DEFAULT_SORT, LIST_COLUMN, nextSort, sortWorkItems } from '@dsh-scrum/scrum-ui'
import { item, itemId } from '../support/items.js'

describe('the order the list draws', () => {
  it('opens in the order the product owner set, not the order it read them', () => {
    const items = [item(2, {}), item(1, {}), item(3, {})]

    expect(sortWorkItems(items, DEFAULT_SORT).map((one) => one.id)).toEqual([
      itemId(1),
      itemId(2),
      itemId(3),
    ])
  })

  it('sorts an estimate as a number rather than as text', () => {
    const items = [item(1, { estimate: 10 }), item(2, { estimate: 2 })]

    expect(
      sortWorkItems(items, { column: LIST_COLUMN.estimate, direction: 'ascending' }).map(
        (one) => one.estimate,
      ),
    ).toEqual([2, 10])
  })

  it('keeps items with no value last whichever way the column is sorted', () => {
    const items = [item(1, {}), item(2, { estimate: 5 }), item(3, { estimate: 1 })]
    const order = (direction: 'ascending' | 'descending') =>
      sortWorkItems(items, { column: LIST_COLUMN.estimate, direction }).map((one) => one.estimate)

    // An unestimated item is not smaller than a one-point item; it is one
    // nobody sized, and burying the sized work under it hides what the column
    // was opened to see.
    expect(order('ascending')).toEqual([1, 5, null])
    expect(order('descending')).toEqual([5, 1, null])
  })

  it('falls back to the product owner order when a column cannot separate two', () => {
    const items = [
      item(3, { priority: PRIORITY.high }),
      item(1, { priority: PRIORITY.high }),
      item(2, { priority: PRIORITY.high }),
    ]

    expect(
      sortWorkItems(items, { column: LIST_COLUMN.priority, direction: 'ascending' }).map(
        (one) => one.id,
      ),
    ).toEqual([itemId(1), itemId(2), itemId(3)])
  })

  it('groups the hierarchy together when sorting by type', () => {
    const items = [
      item(1, { type: WORK_ITEM_TYPE.subtask }),
      item(2, { type: WORK_ITEM_TYPE.epic }),
      item(3, { type: WORK_ITEM_TYPE.story }),
    ]

    expect(
      sortWorkItems(items, { column: LIST_COLUMN.type, direction: 'ascending' }).map(
        (one) => one.level,
      ),
    ).toEqual([1, 2, 3])
  })

  it('sorts by a status the board would show', () => {
    const items = [
      item(1, { status: WORK_ITEM_STATUS.todo }),
      item(2, { status: WORK_ITEM_STATUS.backlog }),
    ]

    expect(
      sortWorkItems(items, { column: LIST_COLUMN.status, direction: 'ascending' }).map(
        (one) => one.status,
      ),
    ).toEqual([WORK_ITEM_STATUS.backlog, WORK_ITEM_STATUS.todo])
  })
})

describe('clicking a column heading', () => {
  it('starts a new column ascending and reverses the one already sorted', () => {
    expect(nextSort(DEFAULT_SORT, LIST_COLUMN.priority)).toEqual({
      column: LIST_COLUMN.priority,
      direction: 'ascending',
    })
    expect(
      nextSort({ column: LIST_COLUMN.priority, direction: 'ascending' }, LIST_COLUMN.priority),
    ).toEqual({ column: LIST_COLUMN.priority, direction: 'descending' })
    expect(
      nextSort({ column: LIST_COLUMN.priority, direction: 'descending' }, LIST_COLUMN.priority),
    ).toEqual({ column: LIST_COLUMN.priority, direction: 'ascending' })
  })
})
