import { describe, expect, it } from 'vitest'
import {
  ConflictError,
  ERROR_CODE,
  ForbiddenError,
  NotFoundError,
  UnsupportedSchemaVersionError,
  ValidationError,
  serializeScrumError,
  type ScrumError,
} from '@dsh-scrum/scrum-domain'

// The API layer, the Agent tools and the UI match on these strings. Renaming
// one silently breaks every consumer, so the full surface is pinned here and a
// change to this list has to be a deliberate contract change.
describe('error code surface', () => {
  it('exposes exactly the published codes', () => {
    expect(ERROR_CODE).toEqual({
      validation: 'VALIDATION',
      conflict: 'CONFLICT',
      forbidden: 'FORBIDDEN',
      notFound: 'NOT_FOUND',
      unsupportedSchemaVersion: 'UNSUPPORTED_SCHEMA_VERSION',
    })
  })

  it('maps every error type to its published code', () => {
    const cases: Array<[ScrumError, string]> = [
      [new ValidationError('bad input'), 'VALIDATION'],
      [new ConflictError('stale write', 1, 2), 'CONFLICT'],
      [new ForbiddenError('not allowed'), 'FORBIDDEN'],
      [new NotFoundError('Sprint', 'sprint-12'), 'NOT_FOUND'],
      [new UnsupportedSchemaVersionError(1, 2), 'UNSUPPORTED_SCHEMA_VERSION'],
    ]

    for (const [error, code] of cases) {
      expect(error.code).toBe(code)
    }
  })
})

describe('error serialization contract', () => {
  it('produces a JSON round trip that keeps the code, message and details', () => {
    const error = new ConflictError('work item changed since it was read', 7, 9, {
      workItemId: 'SCR-12',
    })
    const serialized = serializeScrumError(error)
    const transported: unknown = JSON.parse(JSON.stringify(serialized))

    expect(transported).toEqual({
      code: 'CONFLICT',
      message: 'work item changed since it was read',
      details: { workItemId: 'SCR-12', expectedRevision: 7, actualRevision: 9 },
    })
  })

  it('carries no stack, no class name and no other hidden field', () => {
    const serialized = serializeScrumError(new ValidationError('bad input', { field: 'title' }))

    expect(Object.keys(serialized).sort()).toEqual(['code', 'details', 'message'])
  })
})
