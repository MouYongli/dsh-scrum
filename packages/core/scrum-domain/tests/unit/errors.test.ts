import { describe, expect, it } from 'vitest'
import {
  ConflictError,
  ERROR_CODE,
  ForbiddenError,
  NotFoundError,
  UnsupportedSchemaVersionError,
  ValidationError,
  isScrumError,
  serializeScrumError,
} from '@dsh-scrum/scrum-domain'

describe('domain errors', () => {
  it('carries a stable code and keeps the details caller-supplied', () => {
    const error = new ValidationError('title must not be empty', { field: 'title' })

    expect(error.code).toBe(ERROR_CODE.validation)
    expect(error.details).toEqual({ field: 'title' })
    expect(error.name).toBe('ValidationError')
    expect(error).toBeInstanceOf(Error)
  })

  it('reports both revisions on a conflict so the caller need not read again', () => {
    const error = new ConflictError('work item changed since it was read', 7, 9)

    expect(error.code).toBe(ERROR_CODE.conflict)
    expect(error.expectedRevision).toBe(7)
    expect(error.actualRevision).toBe(9)
    expect(error.details).toEqual({ expectedRevision: 7, actualRevision: 9 })
  })

  it('describes the missing resource without leaking a lookup path', () => {
    const error = new NotFoundError('WorkItem', 'SCR-12')

    expect(error.code).toBe(ERROR_CODE.notFound)
    expect(error.message).toBe('WorkItem SCR-12 was not found')
    expect(error.details).toEqual({ resourceType: 'WorkItem', resourceId: 'SCR-12' })
  })

  it('names both schema versions when stored data is too new', () => {
    const error = new UnsupportedSchemaVersionError(1, 2)

    expect(error.code).toBe(ERROR_CODE.unsupportedSchemaVersion)
    expect(error.supportedVersion).toBe(1)
    expect(error.foundVersion).toBe(2)
    expect(error.message).toContain('version 2 is not supported')
  })

  it('recognizes domain errors and rejects everything else', () => {
    expect(isScrumError(new ForbiddenError('developers may not delete a sprint'))).toBe(true)
    expect(isScrumError(new Error('boom'))).toBe(false)
    expect(isScrumError({ code: ERROR_CODE.forbidden })).toBe(false)
    expect(isScrumError(null)).toBe(false)
  })

  it('serializes to a JSON-safe shape that does not alias the error details', () => {
    const error = new ValidationError('sprint end date precedes its start date', {
      sprintId: 'sprint-12',
    })
    const serialized = serializeScrumError(error)

    expect(serialized).toEqual({
      code: 'VALIDATION',
      message: 'sprint end date precedes its start date',
      details: { sprintId: 'sprint-12' },
    })
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized)

    serialized.details.sprintId = 'sprint-13'
    expect(error.details['sprintId']).toBe('sprint-12')
  })
})
