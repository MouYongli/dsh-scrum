import { describe, expect, it } from 'vitest'
import { WORK_ITEM_STATUS, toIdentityId } from '@dsh-scrum/scrum-domain'
import { BOARD_LANE, boardView } from '@dsh-scrum/scrum-ui'
import { item, itemId } from '../support/items.js'

const ALICE = toIdentityId('idt_01ARZ3NDEKTSV4RRFFQ69G5FAX')

function inProgress(sequence: number): ReturnType<typeof item> {
  return item(sequence, { status: WORK_ITEM_STATUS.inProgress })
}

describe('the work in progress limit', () => {
  it('draws nothing about limits when the project has not set one', () => {
    const view = boardView([inProgress(1)])

    expect(view.columns.every((column) => column.limit === null)).toBe(true)
    expect(view.columns.every((column) => !column.overLimit)).toBe(true)
  })

  it('holds the columns between the ends to the limit, and not the ends', () => {
    // A backlog is a queue and a finished pile is a record; limiting either
    // would be limiting the wrong thing.
    const view = boardView([], { limit: 2 })
    const [first, ...rest] = view.columns
    const last = rest.pop()

    expect(first?.limit).toBeNull()
    expect(last?.limit).toBeNull()
    expect(rest.every((column) => column.limit === 2)).toBe(true)
  })

  it('marks a column that is over, and leaves one that is exactly at it alone', () => {
    const at = boardView([inProgress(1), inProgress(2)], { limit: 2 })
    const over = boardView([inProgress(1), inProgress(2), inProgress(3)], { limit: 2 })
    const column = (view: typeof at): boolean =>
      view.columns.find((one) => one.status === WORK_ITEM_STATUS.inProgress)?.overLimit === true

    expect(column(at)).toBe(false)
    expect(column(over)).toBe(true)
  })
})

describe('swimlanes', () => {
  it('is one unnamed lane when nothing is grouped', () => {
    const view = boardView([inProgress(1)])

    expect(view.lanes).toHaveLength(1)
    expect(view.lanes[0]?.key).toBe('all')
    expect(view.lanes[0]?.label).toBeNull()
  })

  it('splits by assignee and keeps unowned work as its own lane, last', () => {
    const view = boardView([{ ...inProgress(1), assigneeId: ALICE }, inProgress(2)], {
      lane: BOARD_LANE.assignee,
    })

    // Work with no owner is exactly what a lane view is opened to find;
    // dropping it would make the board disagree with its own totals.
    expect(view.lanes.map((lane) => lane.key)).toEqual([ALICE, 'none'])
    expect(view.lanes[1]?.label).toBeNull()
  })

  it('heads an epic lane with the epic title rather than its identifier', () => {
    const view = boardView([{ ...inProgress(2), parentId: itemId(1) }], {
      lane: BOARD_LANE.epic,
      epicTitles: new Map([[itemId(1), '结算']]),
    })

    expect(view.lanes[0]?.label).toBe('结算')
  })

  it('keeps every column in every lane, including the empty ones', () => {
    const view = boardView([{ ...inProgress(1), assigneeId: ALICE }], {
      lane: BOARD_LANE.assignee,
    })

    expect(view.lanes[0]?.columns).toHaveLength(view.columns.length)
    expect(view.lanes[0]?.columns.filter((column) => column.cards.length === 0)).not.toHaveLength(0)
  })
})
