import { describe, expect, it } from 'vitest'
import {
  ERROR_CODE,
  formatSprintId,
  formatWorkItemId,
  isScrumError,
  newIdentityId,
  newProjectId,
  newTenantId,
  projectKeyOf,
  toProjectId,
  toProjectKey,
  toSprintId,
  toTenantId,
  toWorkItemId,
  type IdGenerator,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'

// The error is captured rather than asserted inside a catch: with the
// assertion in the catch block, its own failure would be caught and reported
// as if the code under test had thrown the wrong error.
function caughtFrom(build: () => unknown): unknown {
  try {
    build()
    return undefined
  } catch (error) {
    return error
  }
}

function expectRejects(build: () => unknown, value: string): void {
  const error = caughtFrom(build)
  expect(isScrumError(error) && error.code, `expected ${value} to be rejected`).toBe(
    ERROR_CODE.validation,
  )
}

describe('prefixed identifiers', () => {
  it('accepts a well formed identifier for its own prefix only', () => {
    expect(toProjectId(`prj_${ULID}`)).toBe(`prj_${ULID}`)
    expect(toTenantId(`tnt_${ULID}`)).toBe(`tnt_${ULID}`)
    expectRejects(() => toProjectId(`tnt_${ULID}`), 'tenant id as project id')
  })

  it('rejects malformed bodies, including base32 letters ULID never emits', () => {
    for (const value of [
      'prj_',
      `prj_${ULID.slice(0, 25)}`,
      `prj_${ULID.toLowerCase()}`,
      `prj_01K5TFQ8Z4N7C2M9XPRWD3HABI`,
      // A first character above 7 would need a timestamp beyond ULID's 48 bits.
      `prj_8${ULID.slice(1)}`,
      `prj_Z${ULID.slice(1)}`,
      `prj-${ULID}`,
      ` prj_${ULID}`,
    ]) {
      expectRejects(() => toProjectId(value), value)
    }
  })

  it('generates identifiers through the port and validates what it returns', () => {
    const ids: IdGenerator = { nextUlid: () => ULID }
    expect(newProjectId(ids)).toBe(`prj_${ULID}`)
    expect(newTenantId(ids)).toBe(`tnt_${ULID}`)
    expect(newIdentityId(ids)).toBe(`idt_${ULID}`)

    const broken: IdGenerator = { nextUlid: () => 'not-a-ulid' }
    expectRejects(() => newProjectId(broken), 'generated id')
  })

  it('carries the offending input under details.value on every rejection', () => {
    for (const build of [
      () => toProjectId('nonsense'),
      () => toProjectKey('nonsense'),
      () => toWorkItemId('nonsense'),
      () => toSprintId('nonsense'),
    ]) {
      const error = caughtFrom(build)
      expect(isScrumError(error) && error.details['value']).toBe('nonsense')
    }
  })
})

describe('project keys and derived identifiers', () => {
  it('accepts short uppercase keys and rejects everything else', () => {
    expect(toProjectKey('SCR')).toBe('SCR')
    expect(toProjectKey('A1')).toBe('A1')
    for (const value of ['S', 'scr', 'SCR-1', 'TOOLONGKEYS1', '1SCR', 'SC R']) {
      expectRejects(() => toProjectKey(value), value)
    }
  })

  it('builds and reads back a work item key', () => {
    const key = toProjectKey('SCR')
    expect(formatWorkItemId(key, 12)).toBe('SCR-12')
    expect(projectKeyOf(toWorkItemId('SCR-12'))).toBe('SCR')
  })

  it('rejects sequences that are not positive integers', () => {
    const key = toProjectKey('SCR')
    for (const sequence of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expectRejects(() => formatWorkItemId(key, sequence), String(sequence))
      expectRejects(() => formatSprintId(sequence), String(sequence))
    }
  })

  it('rejects work item and sprint keys with a leading zero or missing number', () => {
    for (const value of ['SCR-0', 'SCR-01', 'SCR-', 'SCR', 'scr-1']) {
      expectRejects(() => toWorkItemId(value), value)
    }
    for (const value of ['sprint-0', 'sprint-01', 'sprint-', 'Sprint-1', '12']) {
      expectRejects(() => toSprintId(value), value)
    }
  })

  it('formats a sprint identifier the way the workspace layout spells it', () => {
    expect(formatSprintId(12)).toBe('sprint-12')
  })
})
