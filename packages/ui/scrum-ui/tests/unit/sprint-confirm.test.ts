import { describe, expect, it } from 'vitest'
import { SPRINT_STATUS } from '@dsh-scrum/scrum-domain'
import { carryTargets, toDispositions } from '@dsh-scrum/scrum-ui'
import { itemId, sprint, sprintId } from '../support/items.js'

describe('where an unfinished item may be carried', () => {
  it('offers the other open sprints, and never the one being closed', () => {
    const sprints = [sprint(1, { status: SPRINT_STATUS.active }), sprint(2)]

    expect(carryTargets(sprints, sprintId(1)).map((entry) => entry.id)).toEqual([sprintId(2)])
  })

  it('never offers a closed sprint, which is a record and not a destination', () => {
    const sprints = [sprint(1), sprint(2, { status: SPRINT_STATUS.closed })]

    expect(carryTargets(sprints, sprintId(1))).toEqual([])
  })
})

describe('turning the answers into dispositions', () => {
  const unfinished = [
    { id: itemId(1), revision: 1 },
    { id: itemId(2), revision: 3 },
  ]

  it('refuses to build one until every item has an answer', () => {
    expect(toDispositions(unfinished, {})).toBeNull()
    expect(toDispositions(unfinished, { [itemId(1)]: 'backlog' })).toBeNull()
    expect(toDispositions(unfinished, { [itemId(1)]: 'backlog', [itemId(2)]: '' })).toBeNull()
  })

  it('reads the backlog answer as no sprint, and a sprint as itself', () => {
    expect(
      toDispositions(unfinished, { [itemId(1)]: 'backlog', [itemId(2)]: sprintId(2) }),
    ).toEqual([
      { workItemId: itemId(1), expectedRevision: 1, moveTo: null },
      { workItemId: itemId(2), expectedRevision: 3, moveTo: sprintId(2) },
    ])
  })

  it('carries the revision each item was read at, so a stale one is refused by name', () => {
    const built = toDispositions(unfinished, { [itemId(1)]: 'backlog', [itemId(2)]: 'backlog' })

    expect(built?.map((entry) => entry.expectedRevision)).toEqual([1, 3])
  })

  it('builds an empty list when nothing is unfinished', () => {
    expect(toDispositions([], {})).toEqual([])
  })
})
