import { describe, expect, it } from 'vitest'
import {
  ERROR_CODE,
  compareRanks,
  isScrumError,
  rankBetween,
  toRank,
  type Rank,
} from '@dsh-scrum/scrum-domain'

function caughtFrom(run: () => unknown): unknown {
  try {
    run()
    return undefined
  } catch (error) {
    return error
  }
}

function expectRejects(run: () => unknown, what: string): void {
  const error = caughtFrom(run)
  expect(isScrumError(error) && error.code, `expected ${what} to be rejected`).toBe(
    ERROR_CODE.validation,
  )
}

describe('rank values', () => {
  it('accepts digits and lowercase letters only', () => {
    expect(toRank('a9')).toBe('a9')
    expectRejects(() => toRank(''), 'an empty rank')
    expectRejects(() => toRank('A9'), 'an uppercase rank')
    expectRejects(() => toRank('0|hzzzzz:'), 'a rank with separators')
    expectRejects(() => toRank('a'.repeat(65)), 'an over long rank')
  })

  it('refuses a trailing zero, which names a position twice', () => {
    expectRejects(() => toRank('a0'), 'a trailing zero')
    expect(toRank('a01')).toBe('a01')
  })
})

describe('ranking between neighbours', () => {
  it('ranks the only item in a list', () => {
    expect(rankBetween(null, null)).toBe('i')
  })

  it('ranks before, after and between existing items', () => {
    const only = rankBetween(null, null)
    const after = rankBetween(only, null)
    const before = rankBetween(null, only)
    const between = rankBetween(before, only)

    expect(before < only).toBe(true)
    expect(only < after).toBe(true)
    expect(before < between && between < only).toBe(true)
  })

  it('refuses bounds that are out of order or equal', () => {
    const low = toRank('a')
    const high = toRank('b')

    expectRejects(() => rankBetween(high, low), 'reversed bounds')
    expectRejects(() => rankBetween(low, low), 'equal bounds')
  })

  // Dropping repeatedly into the same gap is the case that breaks a scheme
  // built on integers or on a fixed number of decimal places.
  it('always finds room, however often the same gap is used', () => {
    const first = toRank('a')
    const last = toRank('b')
    let upper = last
    const produced: Rank[] = []

    for (let index = 0; index < 50; index += 1) {
      upper = rankBetween(first, upper)
      produced.push(upper)
    }

    expect(new Set(produced).size).toBe(produced.length)
    for (const rank of produced) {
      expect(first < rank && rank < last).toBe(true)
    }
    expect([...produced].sort()).toEqual([...produced].reverse())
  })

  it('keeps a backlog in the order the ranks were built', () => {
    const middle = rankBetween(null, null)
    const head = rankBetween(null, middle)
    const tail = rankBetween(middle, null)
    const backlog = [tail, head, middle]

    expect([...backlog].sort(compareRanks)).toEqual([head, middle, tail])
    expect(compareRanks(head, head)).toBe(0)
  })
})
