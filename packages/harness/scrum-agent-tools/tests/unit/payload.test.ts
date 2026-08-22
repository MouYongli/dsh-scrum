import { describe, expect, it } from 'vitest'
import { DEFAULT_LIMIT, MAX_LIMIT, page, requireLimit } from '@dsh-scrum/scrum-agent-tools'

// A tool result is text in a conversation with a finite window, so the bound
// belongs to the tool rather than to whoever calls it.

describe('requireLimit', () => {
  it('uses its own default when the caller says nothing', () => {
    expect(requireLimit(undefined)).toBe(DEFAULT_LIMIT)
  })

  it('refuses more than the cap rather than quietly honouring it', () => {
    expect(() => requireLimit(MAX_LIMIT + 1)).toThrow(/between 1 and/)
  })

  it('refuses a fraction and a zero', () => {
    expect(() => requireLimit(1.5)).toThrow(/whole number/)
    expect(() => requireLimit(0)).toThrow(/between 1 and/)
  })

  it('accepts the cap itself', () => {
    expect(requireLimit(MAX_LIMIT)).toBe(MAX_LIMIT)
  })
})

describe('page', () => {
  it('says how much it left behind', () => {
    const cut = page(
      Array.from({ length: 50 }, (_item, index) => index),
      20,
    )

    expect(cut.items).toHaveLength(20)
    expect(cut.total).toBe(50)
    expect(cut.truncated).toBe(true)
  })

  it('reports nothing truncated when everything fits', () => {
    const whole = page([1, 2, 3], 20)

    expect(whole).toEqual({ items: [1, 2, 3], total: 3, truncated: false })
  })
})
