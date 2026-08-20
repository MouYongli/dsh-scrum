import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ConflictError, ERROR_CODE, isScrumError } from '@dsh-scrum/scrum-domain'
import {
  API_VERSION,
  UnsupportedApiVersionError,
  createRequest,
  errorResponse,
  isErrorResponse,
  parseRequest,
  parseResponse,
  successResponse,
} from '@dsh-scrum/scrum-api-contract'

const createWorkItem = z.object({ title: z.string().min(1), estimate: z.number().int().optional() })
const workItem = z.object({ id: z.string(), title: z.string() })

function codeOf(build: () => unknown): string | undefined {
  try {
    build()
    return undefined
  } catch (error) {
    return isScrumError(error) ? error.code : undefined
  }
}

describe('request envelope', () => {
  it('round trips a request built by this build', () => {
    const request = createRequest({ title: 'user redeems a coupon' })

    expect(request).toEqual({ apiVersion: 1, data: { title: 'user redeems a coupon' } })
    expect(parseRequest(createWorkItem, JSON.parse(JSON.stringify(request)))).toEqual(request)
  })

  it('rejects a payload without an envelope version', () => {
    expect(codeOf(() => parseRequest(createWorkItem, { data: { title: 'x' } }))).toBe(
      ERROR_CODE.validation,
    )
    expect(codeOf(() => parseRequest(createWorkItem, null))).toBe(ERROR_CODE.validation)
  })

  it('reports the version before the payload, so a mismatch is not field noise', () => {
    expect(() => parseRequest(createWorkItem, { apiVersion: 2, data: { title: 42 } })).toThrowError(
      UnsupportedApiVersionError,
    )
  })

  it('treats a fractional version as a malformed envelope, not a version mismatch', () => {
    expect(codeOf(() => parseRequest(createWorkItem, { apiVersion: 1.5, data: {} }))).toBe(
      ERROR_CODE.validation,
    )
  })

  it('names the fields that failed', () => {
    try {
      parseRequest(createWorkItem, { apiVersion: 1, data: { title: '', estimate: 1.5 } })
      expect.unreachable('payload must be rejected')
    } catch (error) {
      expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
      expect(isScrumError(error) && error.details['issues']).toEqual([
        { path: 'title', code: 'too_small', message: expect.any(String) },
        { path: 'estimate', code: 'invalid_type', message: expect.any(String) },
      ])
    }
  })
})

describe('response envelope', () => {
  it('carries data on success and an error on failure', () => {
    const success = successResponse({ id: 'SCR-12', title: 'user redeems a coupon' })
    expect(isErrorResponse(success)).toBe(false)
    expect(parseResponse(workItem, JSON.parse(JSON.stringify(success)))).toEqual(success)

    const failure = errorResponse(new ConflictError('work item changed since it was read', 7, 9))
    expect(isErrorResponse(failure)).toBe(true)
    expect(failure.error).toEqual({
      code: ERROR_CODE.conflict,
      message: 'work item changed since it was read',
      details: { expectedRevision: 7, actualRevision: 9 },
    })
    expect(parseResponse(workItem, JSON.parse(JSON.stringify(failure)))).toEqual(failure)
  })

  it('reads an envelope that spells an absent error as null as a success', () => {
    const item = { id: 'SCR-12', title: 'user redeems a coupon' }

    expect(parseResponse(workItem, { apiVersion: 1, data: item, error: null })).toEqual({
      apiVersion: 1,
      data: item,
    })
  })

  it('never forwards the message or details of an unexpected error', () => {
    const leaky = new Error('ENOENT: /Users/someone/.scrum/project.json, token=abc123')

    expect(errorResponse(leaky)).toEqual({
      apiVersion: API_VERSION,
      error: { code: ERROR_CODE.internal, message: 'internal error', details: {} },
    })
  })

  it('degrades an error code from a newer peer instead of failing the response', () => {
    const fromNewerPeer = {
      apiVersion: 1,
      error: { code: 'RATE_LIMITED', message: 'too many requests', details: { retryAfter: 30 } },
    }

    expect(parseResponse(workItem, fromNewerPeer)).toEqual({
      apiVersion: 1,
      error: {
        code: ERROR_CODE.internal,
        message: 'too many requests',
        details: { retryAfter: 30, originalCode: 'RATE_LIMITED' },
      },
    })
  })
})
