import { describe, expect, it } from 'vitest'
import {
  stringReference,
  toActivitySource,
  toIdempotencyKey,
  toWorkspaceRef,
} from '@dsh-scrum/scrum-application'

// The port constructors are the only place these values are checked. Anything
// that gets past them is stored, and a stored value nothing rejected is a
// value every later layer has to cope with.

describe('toIdempotencyKey', () => {
  it('trims, so one key spelled two ways is one key', () => {
    expect(toIdempotencyKey('  retry-1  ')).toBe('retry-1')
  })

  it('refuses a key with nothing in it', () => {
    expect(() => toIdempotencyKey(' \t ')).toThrow(/must not be empty/)
  })

  it('refuses a key too long to be a lookup key anywhere it is stored', () => {
    expect(() => toIdempotencyKey('k'.repeat(201))).toThrow(/at most 200/)
  })
})

describe('toWorkspaceRef', () => {
  it('trims both halves of the reference', () => {
    expect(toWorkspaceRef(' dsh_local_1 ', ' /home/me/shop ')).toEqual({
      instanceId: 'dsh_local_1',
      workspaceId: '/home/me/shop',
    })
  })

  it('refuses an empty instance', () => {
    expect(() => toWorkspaceRef('', '/home/me/shop')).toThrow(/instance id/)
  })

  it('refuses a workspace reference too long to store', () => {
    expect(() => toWorkspaceRef('dsh_local_1', 'w'.repeat(201))).toThrow(/workspace id/)
  })
})

describe('toActivitySource', () => {
  it('accepts every published source', () => {
    expect(toActivitySource('automation')).toBe('automation')
  })

  it('refuses one it does not publish', () => {
    expect(() => toActivitySource('cron')).toThrow(/ActivitySource/)
  })
})

describe('stringReference', () => {
  it('refuses a stored reference that is not an identifier', () => {
    expect(() => stringReference(7)).toThrow(/not an identifier/)
  })
})
