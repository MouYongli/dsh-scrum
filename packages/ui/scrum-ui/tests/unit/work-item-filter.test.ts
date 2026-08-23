import { describe, expect, it } from 'vitest'
import { WORK_ITEM_CATEGORY, WORK_ITEM_TYPE, toSprintId } from '@dsh-scrum/scrum-domain'
import { EMPTY_QUERY, UNPLANNED, isNarrowed, toBacklogQuery, underEpic } from '@dsh-scrum/scrum-ui'
import { item, itemId } from '../support/items.js'

describe('what the shared filter sends', () => {
  it('drops the lists nobody filled in', () => {
    // An absent field means "do not narrow by this". An empty array would ask
    // the host to match nothing, which is the opposite.
    expect(toBacklogQuery(EMPTY_QUERY)).toEqual({})
    expect(toBacklogQuery({ ...EMPTY_QUERY, text: '  ' })).toEqual({})
  })

  it('sends what was filled in, trimmed', () => {
    expect(
      toBacklogQuery({
        ...EMPTY_QUERY,
        text: ' 结算 ',
        types: [WORK_ITEM_TYPE.bug],
        categories: [WORK_ITEM_CATEGORY.techDebt],
      }),
    ).toEqual({
      text: '结算',
      types: [WORK_ITEM_TYPE.bug],
      categories: [WORK_ITEM_CATEGORY.techDebt],
    })
  })

  it('takes the sprint scope from the page rather than the query', () => {
    // A backlog is the work in no sprint and a board is one sprint's. Carrying
    // that between pages would mean narrowing the list to a sprint and finding
    // the backlog had stopped being a backlog.
    expect(toBacklogQuery(EMPTY_QUERY, UNPLANNED)).toEqual({ sprintId: null })
    expect(toBacklogQuery(EMPTY_QUERY, toSprintId('sprint-1'))).toEqual({ sprintId: 'sprint-1' })
    expect('sprintId' in toBacklogQuery(EMPTY_QUERY)).toBe(false)
  })

  it('counts only what the user typed as narrowing', () => {
    expect(isNarrowed(EMPTY_QUERY)).toBe(false)
    expect(isNarrowed({ ...EMPTY_QUERY, labels: ['结算'] })).toBe(true)
    expect(isNarrowed({ ...EMPTY_QUERY, assigneeId: null })).toBe(true)
  })
})

describe('narrowing to one epic', () => {
  it('keeps the epic, its children and their subtasks', () => {
    const items = [
      item(1, { type: WORK_ITEM_TYPE.epic }),
      item(2, { parentId: itemId(1) }),
      item(3, { type: WORK_ITEM_TYPE.subtask, parentId: itemId(2) }),
      item(4, {}),
    ]

    // Grandchildren included: a subtask counts through its own parent, and
    // "this epic" is what somebody asking means by it.
    expect(underEpic(items, itemId(1)).map((one) => one.id)).toEqual([
      itemId(1),
      itemId(2),
      itemId(3),
    ])
    expect(underEpic(items, undefined)).toHaveLength(4)
  })
})
