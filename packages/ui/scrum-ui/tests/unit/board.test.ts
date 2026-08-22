import { describe, expect, it } from 'vitest'
import { WORK_ITEM_STATUS } from '@dsh-scrum/scrum-domain'
import { BOARD_COLUMNS, boardView, moveTargets } from '@dsh-scrum/scrum-ui'
import { item } from '../support/items.js'

describe('the columns a board draws', () => {
  it('draws every column, including the ones nothing is in', () => {
    const view = boardView([item(1, { status: WORK_ITEM_STATUS.todo })])

    expect(view.columns.map((column) => column.status)).toEqual(BOARD_COLUMNS)
    expect(view.columns.filter((column) => column.cards.length === 0)).toHaveLength(
      BOARD_COLUMNS.length - 1,
    )
  })

  it('starts at to do and ends at done, leaving the backlog out', () => {
    expect(BOARD_COLUMNS[0]).toBe(WORK_ITEM_STATUS.todo)
    expect(BOARD_COLUMNS.at(-1)).toBe(WORK_ITEM_STATUS.done)
    expect(BOARD_COLUMNS).not.toContain(WORK_ITEM_STATUS.backlog)
  })

  it('counts an item the board cannot show rather than dropping it', () => {
    expect(boardView([item(1, { status: WORK_ITEM_STATUS.backlog })]).hidden).toBe(1)
  })
})

describe('what a board totals', () => {
  it('adds the estimates per column and counts the unestimated beside them', () => {
    const view = boardView([
      item(1, { status: WORK_ITEM_STATUS.todo, estimate: 3 }),
      item(2, { status: WORK_ITEM_STATUS.todo }),
      item(3, { status: WORK_ITEM_STATUS.done, estimate: 5 }),
    ])

    expect(view.columns[0]?.totals).toEqual({ count: 2, estimate: 3, unestimated: 1 })
    expect(view.total).toEqual({ count: 3, estimate: 8, unestimated: 1 })
  })

  it('reports what is finished, which is not the same as what is in the last column', () => {
    const view = boardView([
      item(1, { status: WORK_ITEM_STATUS.review, estimate: 2 }),
      item(2, { status: WORK_ITEM_STATUS.done, estimate: 5 }),
    ])

    expect(view.finished).toEqual({ count: 1, estimate: 5, unestimated: 0 })
  })
})

describe('a card', () => {
  it('carries its blocked state and its acceptance progress', () => {
    const view = boardView([
      item(1, {
        status: WORK_ITEM_STATUS.inProgress,
        blockedReason: '等待接口',
        acceptanceCriteria: [
          { text: '可对账', satisfied: true },
          { text: '可导出', satisfied: false },
        ],
      }),
    ])
    const card = view.columns.find((column) => column.status === WORK_ITEM_STATUS.inProgress)
      ?.cards[0]

    expect(card?.blocked).toBe(true)
    expect(card?.criteria).toEqual({ satisfied: 1, total: 2 })
  })
})

describe('where a card may go', () => {
  it('offers every other column, not only the next one', () => {
    expect(moveTargets(WORK_ITEM_STATUS.inProgress)).toEqual([
      WORK_ITEM_STATUS.todo,
      WORK_ITEM_STATUS.review,
      WORK_ITEM_STATUS.done,
    ])
  })
})
