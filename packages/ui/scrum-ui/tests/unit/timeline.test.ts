import { describe, expect, it } from 'vitest'
import {
  SPRINT_STATUS,
  WORK_ITEM_RESOLUTION,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
} from '@dsh-scrum/scrum-domain'
import { timelineView } from '@dsh-scrum/scrum-ui'
import { item, itemId, sprint } from '../support/items.js'

// The fixtures put every sprint on the same fortnight, so a second one is
// built by hand where two columns are needed.
const FIRST = sprint(1)
const SECOND: typeof FIRST = {
  ...sprint(2, { status: SPRINT_STATUS.planned }),
  startDate: '2026-03-16T09:00:00.000Z' as typeof FIRST.startDate,
  endDate: '2026-03-30T09:00:00.000Z' as typeof FIRST.endDate,
}

describe('the grid', () => {
  it('runs in date order, not the order the sprints were created', () => {
    const view = timelineView({ items: [], sprints: [SECOND, FIRST] })

    expect(view.columns.map((column) => column.sprint.id)).toEqual([FIRST.id, SECOND.id])
    expect(view.span).toEqual({ start: FIRST.startDate, end: SECOND.endDate })
  })

  it('has no span at all when the project has planned nothing', () => {
    const view = timelineView({ items: [item(1)], sprints: [] })

    expect(view.span).toBeNull()
    expect(view.columns).toEqual([])
  })
})

describe('where a bar comes from', () => {
  it('takes the dates of the sprint the item is in', () => {
    const view = timelineView({
      items: [item(1, { sprintId: SECOND.id })],
      sprints: [FIRST, SECOND],
    })

    expect(view.rows[0]?.bar?.span).toEqual({ start: SECOND.startDate, end: SECOND.endDate })
    // The grid runs 1 March to 30 March and the second sprint opens on the
    // 16th, so the bar starts fifteen days into twenty-nine and runs to the end.
    expect(view.rows[0]?.bar?.from).toBeCloseTo(15 / 29)
    expect(view.rows[0]?.bar?.to).toBe(1)
  })

  it('groups work in no sprint as unscheduled and draws no bar for it', () => {
    const view = timelineView({ items: [item(1)], sprints: [FIRST] })

    expect(view.rows).toEqual([])
    expect(view.unscheduled.map((row) => row.item.id)).toEqual([itemId(1)])
    expect(view.unscheduled[0]?.bar).toBeNull()
  })
})

describe('an epic', () => {
  const epic = item(1, { type: WORK_ITEM_TYPE.epic })

  it('covers the earliest start to the latest end of what it holds', () => {
    const view = timelineView({
      items: [
        epic,
        item(2, { parentId: epic.id, sprintId: FIRST.id }),
        item(3, { parentId: epic.id, sprintId: SECOND.id }),
      ],
      sprints: [FIRST, SECOND],
    })

    // An epic is never in a sprint itself, so without this it would have no
    // time at all and the row would be a label with nothing beside it.
    expect(view.rows[0]?.bar?.span).toEqual({ start: FIRST.startDate, end: SECOND.endDate })
    expect(view.rows[0]?.children).toHaveLength(2)
  })

  it('reaches through a subtask to the sprint its parent is in', () => {
    const view = timelineView({
      items: [
        epic,
        item(2, { parentId: epic.id, sprintId: SECOND.id }),
        item(3, { type: WORK_ITEM_TYPE.subtask, parentId: itemId(2), sprintId: SECOND.id }),
      ],
      sprints: [FIRST, SECOND],
    })

    expect(view.rows[0]?.children[0]?.children).toHaveLength(1)
  })

  it('measures progress in points, counting an unsized child as one', () => {
    const view = timelineView({
      items: [
        epic,
        item(2, {
          parentId: epic.id,
          sprintId: FIRST.id,
          estimate: 3,
          status: WORK_ITEM_STATUS.done,
          resolution: WORK_ITEM_RESOLUTION.done,
        }),
        item(3, { parentId: epic.id, sprintId: FIRST.id, estimate: 5 }),
        item(4, { parentId: epic.id, sprintId: FIRST.id }),
      ],
      sprints: [FIRST],
    })

    // 3 of 9: the unsized child cannot add to what was delivered, but leaving
    // it out of the total would let the epic read as complete while holding
    // work nobody sized.
    expect(view.rows[0]?.progress).toEqual({ delivered: 3, total: 9 })
  })

  it('leaves progress off a row that contains nothing', () => {
    const view = timelineView({
      items: [item(1, { sprintId: FIRST.id })],
      sprints: [FIRST],
    })

    // A leaf's progress is its status; a percentage on it would be 0 or 100
    // dressed up as a measurement.
    expect(view.rows[0]?.progress).toBeNull()
  })
})

describe('narrowing', () => {
  it('draws a child whose parent the filter left out', () => {
    const view = timelineView({
      items: [item(2, { parentId: itemId(1), sprintId: FIRST.id })],
      sprints: [FIRST],
    })

    // Narrowing to one epic's children must not leave every one of them
    // invisible for want of a parent row.
    expect(view.rows.map((row) => row.item.id)).toEqual([itemId(2)])
  })
})
