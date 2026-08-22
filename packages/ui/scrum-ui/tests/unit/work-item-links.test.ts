import { describe, expect, it } from 'vitest'
import { rankTargetFor } from '@dsh-scrum/scrum-ui'
import { item, itemId } from '../support/items.js'

const ORDERED = [item(1), item(2), item(3), item(4)]

describe('where a moved item lands', () => {
  it('moves up between the two neighbours above it', () => {
    expect(rankTargetFor(ORDERED, itemId(3), 'up')).toEqual({
      after: ORDERED[0]?.rank,
      before: ORDERED[1]?.rank,
    })
  })

  it('moves down between the two neighbours below it', () => {
    expect(rankTargetFor(ORDERED, itemId(2), 'down')).toEqual({
      after: ORDERED[2]?.rank,
      before: ORDERED[3]?.rank,
    })
  })

  it('reports no neighbour above the top, rather than rank zero', () => {
    expect(rankTargetFor(ORDERED, itemId(2), 'up')).toEqual({
      after: null,
      before: ORDERED[0]?.rank,
    })
  })

  it('reports no neighbour below the bottom', () => {
    expect(rankTargetFor(ORDERED, itemId(3), 'down')).toEqual({
      after: ORDERED[3]?.rank,
      before: null,
    })
  })

  it('refuses to move the first item up or the last one down', () => {
    expect(rankTargetFor(ORDERED, itemId(1), 'up')).toBeNull()
    expect(rankTargetFor(ORDERED, itemId(4), 'down')).toBeNull()
  })

  it('refuses to move an item that is not in the list', () => {
    expect(rankTargetFor(ORDERED, itemId(9), 'up')).toBeNull()
  })

  it('computes against the whole backlog, not the group a row is drawn in', () => {
    // SCR-2 sits between SCR-1 and SCR-3 in rank order even when a grouping
    // draws it next to SCR-4; the target has to come from the order, not the
    // drawing.
    expect(rankTargetFor(ORDERED, itemId(4), 'up')).toEqual({
      after: ORDERED[1]?.rank,
      before: ORDERED[2]?.rank,
    })
  })
})
