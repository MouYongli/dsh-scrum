import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ERROR_CODE, isScrumError } from '@dsh-scrum/scrum-domain'
import {
  UnsupportedApiVersionError,
  isErrorResponse,
  parseRequest,
  parseResponse,
} from '@dsh-scrum/scrum-api-contract'

// Stored payloads, not payloads this build produces. They are the regression
// guard for backward compatibility: once a fixture exists, version 1 has to
// keep reading it, and a change that breaks one is a contract change.
function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures', 'v1', `${name}.json`), 'utf8'),
  )
}

const createWorkItemRequest = z.object({
  projectId: z.string(),
  type: z.enum(['epic', 'story', 'task', 'bug']),
  title: z.string().min(1),
  estimate: z.number().int().positive().optional(),
})

const workItemResponse = z.object({
  id: z.string(),
  title: z.string(),
  revision: z.number().int().positive(),
  updatedAt: z.string(),
})

describe('api version 1 payloads', () => {
  it('reads a stored request fixture', () => {
    const request = parseRequest(createWorkItemRequest, fixture('create-work-item-request'))

    expect(request.apiVersion).toBe(1)
    expect(request.data.title).toBe('用户使用优惠券')
    expect(request.data.estimate).toBe(5)
  })

  it('reads a stored success response fixture', () => {
    const response = parseResponse(workItemResponse, fixture('work-item-response'))

    expect(isErrorResponse(response)).toBe(false)
    expect(response).toEqual({
      apiVersion: 1,
      data: {
        id: 'SCR-12',
        title: '用户使用优惠券',
        revision: 8,
        updatedAt: '2026-08-20T12:00:00.000Z',
      },
    })
  })

  it('reads a stored error response fixture with its details intact', () => {
    const response = parseResponse(workItemResponse, fixture('conflict-error-response'))

    expect(isErrorResponse(response) && response.error).toEqual({
      code: ERROR_CODE.conflict,
      message: 'work item changed since it was read',
      details: { expectedRevision: 7, actualRevision: 9 },
    })
  })

  it('ignores fields a newer version added, as long as the version is supported', () => {
    const withUnknownField = {
      apiVersion: 1,
      data: { id: 'SCR-12', title: 'x', revision: 1, updatedAt: 'now', productGoalId: 'goal_1' },
    }

    expect(parseResponse(workItemResponse, withUnknownField)).toEqual({
      apiVersion: 1,
      data: { id: 'SCR-12', title: 'x', revision: 1, updatedAt: 'now' },
    })
  })
})

describe('unsupported api versions', () => {
  it('refuses a request from a newer build without reading its payload', () => {
    // Captured, not asserted inside a catch: a failing assertion there would
    // itself be caught and misreported as the error under test.
    let error: unknown
    try {
      parseRequest(createWorkItemRequest, fixture('future-version-request'))
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(UnsupportedApiVersionError)
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.unsupportedApiVersion)
    expect(isScrumError(error) && error.details).toEqual({
      requestedVersion: 2,
      supportedVersions: [1],
    })
  })

  it('refuses a response from a newer build the same way', () => {
    expect(() => parseResponse(workItemResponse, { apiVersion: 2, data: {} })).toThrowError(
      UnsupportedApiVersionError,
    )
  })

  it('treats a missing or malformed version as a validation failure, not a mismatch', () => {
    for (const raw of [{ data: {} }, { apiVersion: '1', data: {} }, 'not an envelope']) {
      let code: string | undefined
      try {
        parseRequest(createWorkItemRequest, raw)
      } catch (error) {
        code = isScrumError(error) ? error.code : undefined
      }
      expect(code).toBe(ERROR_CODE.validation)
    }
  })
})
