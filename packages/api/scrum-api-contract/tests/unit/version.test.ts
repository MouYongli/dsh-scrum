import { describe, expect, it } from 'vitest'
import { ERROR_CODE, isScrumError, serializeScrumError } from '@dsh-scrum/scrum-domain'
import {
  API_VERSION,
  SUPPORTED_API_VERSIONS,
  UnsupportedApiVersionError,
  assertSupportedApiVersion,
  isSupportedApiVersion,
} from '@dsh-scrum/scrum-api-contract'

describe('api version negotiation', () => {
  it('implements version 1 and reports it as supported', () => {
    expect(API_VERSION).toBe(1)
    expect(SUPPORTED_API_VERSIONS).toEqual([1])
    expect(isSupportedApiVersion(API_VERSION)).toBe(true)
    expect(assertSupportedApiVersion(1)).toBe(1)
  })

  it('refuses a newer or unknown version', () => {
    for (const version of [0, 2, 99, -1, 1.5]) {
      expect(isSupportedApiVersion(version)).toBe(false)
      expect(() => assertSupportedApiVersion(version)).toThrowError(UnsupportedApiVersionError)
    }
  })

  it('tells the caller which versions this build implements', () => {
    // Captured, not asserted inside a catch: a failing assertion there would
    // itself be caught and misreported as the error under test.
    let error: unknown
    try {
      assertSupportedApiVersion(2)
    } catch (caught) {
      error = caught
    }

    expect(isScrumError(error)).toBe(true)
    const serialized = serializeScrumError(error as UnsupportedApiVersionError)

    expect(serialized.code).toBe(ERROR_CODE.unsupportedApiVersion)
    expect(serialized.message).toContain('api version 2 is not supported')
    expect(serialized.details).toEqual({ requestedVersion: 2, supportedVersions: [1] })
  })

  it('is a domain error, so a boundary can serialize it like any other', () => {
    expect(isScrumError(new UnsupportedApiVersionError(2))).toBe(true)
    expect(new UnsupportedApiVersionError(2).name).toBe('UnsupportedApiVersionError')
  })
})
