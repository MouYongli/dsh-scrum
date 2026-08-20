import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  ERROR_CODE,
  INITIAL_REVISION,
  assertSupportedSchemaVersion,
  compareTimestamps,
  createEntityMetadata,
  isScrumError,
  nextRevision,
  timestampFromDate,
  timestampToDate,
  toRevision,
  toSchemaVersion,
  toTimestamp,
  touchEntityMetadata,
  type Clock,
} from '@dsh-scrum/scrum-domain'

function codeOf(build: () => unknown): string | undefined {
  try {
    build()
    return undefined
  } catch (error) {
    return isScrumError(error) ? error.code : undefined
  }
}

describe('timestamps', () => {
  it('normalizes accepted instants to a single canonical spelling', () => {
    expect(toTimestamp('2026-08-20T10:00:00Z')).toBe('2026-08-20T10:00:00.000Z')
    expect(toTimestamp('2026-08-20T10:00:00.123Z')).toBe('2026-08-20T10:00:00.123Z')
    expect(timestampFromDate(new Date(Date.UTC(2026, 7, 20, 10)))).toBe('2026-08-20T10:00:00.000Z')
  })

  it('rejects local times, offsets and dates that do not exist', () => {
    for (const value of [
      '2026-08-20T10:00:00+02:00',
      '2026-08-20 10:00:00Z',
      '2026-08-20',
      '2026-02-30T00:00:00Z',
      '2026-13-01T00:00:00Z',
    ]) {
      expect(codeOf(() => toTimestamp(value))).toBe(ERROR_CODE.validation)
    }
    expect(codeOf(() => timestampFromDate(new Date('nonsense')))).toBe(ERROR_CODE.validation)
  })

  it('rejects dates outside the four-digit-year range instead of changing spelling', () => {
    // `toISOString` renders these as `+275760-…` and `-000001-…`, which would
    // break both the canonical pattern and plain-string ordering.
    for (const date of [new Date(Date.UTC(275760, 8, 13)), new Date(-62167219200001)]) {
      expect(codeOf(() => timestampFromDate(date))).toBe(ERROR_CODE.validation)
    }
  })

  it('round-trips through a Date without rewriting the stored value', () => {
    const stored = toTimestamp('2026-08-20T10:00:00.123Z')
    expect(timestampFromDate(timestampToDate(stored))).toBe(stored)
  })

  it('orders canonical instants as plain strings', () => {
    const earlier = toTimestamp('2026-08-20T10:00:00Z')
    const later = toTimestamp('2026-08-20T12:00:00Z')

    expect(compareTimestamps(earlier, later)).toBe(-1)
    expect(compareTimestamps(later, earlier)).toBe(1)
    expect(compareTimestamps(earlier, earlier)).toBe(0)
    expect([later, earlier].sort(compareTimestamps)).toEqual([earlier, later])
  })

  it('is satisfied by a fixed clock without touching the real time', () => {
    const clock: Clock = { now: () => toTimestamp('2026-08-20T10:00:00Z') }
    expect(clock.now()).toBe('2026-08-20T10:00:00.000Z')
  })
})

describe('revisions', () => {
  it('starts at one and advances by one', () => {
    expect(INITIAL_REVISION).toBe(1)
    expect(nextRevision(INITIAL_REVISION)).toBe(2)
    expect(nextRevision(toRevision(41))).toBe(42)
  })

  it('rejects zero, negative, fractional and unsafe values', () => {
    for (const value of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(codeOf(() => toRevision(value))).toBe(ERROR_CODE.validation)
    }
  })
})

describe('entity metadata', () => {
  const created = toTimestamp('2026-08-20T10:00:00Z')
  const updated = toTimestamp('2026-08-20T12:00:00Z')

  it('creates metadata at the current schema version and first revision', () => {
    expect(createEntityMetadata(created)).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      revision: INITIAL_REVISION,
      createdAt: created,
      updatedAt: created,
    })
  })

  it('advances the revision and updatedAt while leaving creation facts alone', () => {
    const touched = touchEntityMetadata(createEntityMetadata(created), updated)

    expect(touched).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      revision: 2,
      createdAt: created,
      updatedAt: updated,
    })
  })

  it('refuses a touch earlier than the stored updatedAt, accepts the same instant', () => {
    const stored = touchEntityMetadata(createEntityMetadata(created), updated)

    expect(codeOf(() => touchEntityMetadata(stored, created))).toBe(ERROR_CODE.validation)
    expect(touchEntityMetadata(stored, updated).updatedAt).toBe(updated)
  })

  it('keeps the stored schema version of an entity written by an older build', () => {
    const stored = { ...createEntityMetadata(created), schemaVersion: toSchemaVersion(1) }
    expect(touchEntityMetadata(stored, updated).schemaVersion).toBe(1)
  })

  it('accepts a schema version this build understands and refuses a newer one', () => {
    expect(assertSupportedSchemaVersion(CURRENT_SCHEMA_VERSION)).toBe(CURRENT_SCHEMA_VERSION)
    expect(codeOf(() => assertSupportedSchemaVersion(CURRENT_SCHEMA_VERSION + 1))).toBe(
      ERROR_CODE.unsupportedSchemaVersion,
    )
    expect(codeOf(() => assertSupportedSchemaVersion(0))).toBe(ERROR_CODE.validation)
  })
})
