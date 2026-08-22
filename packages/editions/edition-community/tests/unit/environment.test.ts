import { describe, expect, it } from 'vitest'
import { createUlidGenerator, systemClock } from '@dsh-scrum/edition-community'
import { toIdentityId, toTimestamp } from '@dsh-scrum/scrum-domain'

describe('the identifiers a Community installation issues', () => {
  it('are accepted by the domain that has to parse them back', () => {
    const ids = createUlidGenerator()

    expect(() => toIdentityId(`idt_${ids.nextUlid()}`)).not.toThrow()
  })

  it('sort by the moment they were issued, which is what keeps listings ordered', () => {
    const earlier = createUlidGenerator(() => 1_700_000_000_000).nextUlid()
    const later = createUlidGenerator(() => 1_800_000_000_000).nextUlid()

    expect(earlier < later).toBe(true)
  })

  it('differ for two issued in the same millisecond', () => {
    const ids = createUlidGenerator(() => 1_700_000_000_000)

    expect(ids.nextUlid()).not.toBe(ids.nextUlid())
  })
})

describe('the clock', () => {
  it('answers in the canonical spelling the store round trips', () => {
    expect(() => toTimestamp(systemClock.now())).not.toThrow()
  })
})
