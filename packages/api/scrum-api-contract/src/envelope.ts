import {
  ERROR_CODE,
  ValidationError,
  isScrumError,
  serializeScrumError,
  type ErrorCode,
  type ErrorDetails,
  type JsonValue,
  type SerializedScrumError,
} from '@dsh-scrum/scrum-domain'
import { z } from 'zod'
import { API_VERSION, assertSupportedApiVersion, type ApiVersion } from './version.js'

export interface ApiRequest<Data> {
  readonly apiVersion: ApiVersion
  readonly data: Data
}

export interface ApiSuccessResponse<Data> {
  readonly apiVersion: ApiVersion
  readonly data: Data
}

export interface ApiErrorResponse {
  readonly apiVersion: ApiVersion
  readonly error: SerializedScrumError
}

export type ApiResponse<Data> = ApiSuccessResponse<Data> | ApiErrorResponse

const KNOWN_ERROR_CODES = Object.values(ERROR_CODE)

// The shell is parsed before the payload so that a version mismatch is
// reported as such, instead of as a pile of field errors produced by reading a
// differently shaped payload with this version's schema.
const shellSchema = z.looseObject({ apiVersion: z.int() })

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.json()).default({}),
})

/** Turns a schema failure into a domain validation error that names the fields. */
export function toValidationError(
  error: z.ZodError,
  message = 'payload is invalid',
): ValidationError {
  const issues: JsonValue = error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    code: issue.code,
    message: issue.message,
  }))
  return new ValidationError(message, { issues })
}

function parseOrThrow<Data>(schema: z.ZodType<Data>, value: unknown, message: string): Data {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw toValidationError(result.error, message)
  }
  return result.data
}

export function createRequest<Data>(data: Data): ApiRequest<Data> {
  return { apiVersion: API_VERSION, data }
}

/**
 * Reads an incoming request: envelope first, then version, then payload.
 * Throws `UnsupportedApiVersionError` or `ValidationError`, which the caller
 * turns back into an error envelope with {@link errorResponse}.
 */
export function parseRequest<Data>(schema: z.ZodType<Data>, raw: unknown): ApiRequest<Data> {
  const shell = parseOrThrow(shellSchema, raw, 'request envelope is invalid')
  const apiVersion = assertSupportedApiVersion(shell.apiVersion)

  return { apiVersion, data: parseOrThrow(schema, shell['data'], 'request payload is invalid') }
}

export function successResponse<Data>(data: Data): ApiSuccessResponse<Data> {
  return { apiVersion: API_VERSION, data }
}

/**
 * Wraps a failure for transport. Domain errors travel with their code and
 * details; anything else degrades to INTERNAL with no detail at all, because
 * an unexpected error's message may carry a filesystem path, a query or a
 * credential.
 */
export function errorResponse(error: unknown): ApiErrorResponse {
  if (isScrumError(error)) {
    return { apiVersion: API_VERSION, error: serializeScrumError(error) }
  }
  return {
    apiVersion: API_VERSION,
    error: { code: ERROR_CODE.internal, message: 'internal error', details: {} },
  }
}

export function isErrorResponse<Data>(response: ApiResponse<Data>): response is ApiErrorResponse {
  return 'error' in response && response.error != null
}

/**
 * A code this build does not know can only come from a newer peer. The
 * envelope stays usable by degrading it to INTERNAL while keeping the original
 * code in the details, rather than failing the whole response.
 */
function normalizeErrorCode(error: {
  code: string
  message: string
  details: ErrorDetails
}): SerializedScrumError {
  if ((KNOWN_ERROR_CODES as string[]).includes(error.code)) {
    return { code: error.code as ErrorCode, message: error.message, details: error.details }
  }
  return {
    code: ERROR_CODE.internal,
    message: error.message,
    details: { ...error.details, originalCode: error.code },
  }
}

export function parseResponse<Data>(schema: z.ZodType<Data>, raw: unknown): ApiResponse<Data> {
  const shell = parseOrThrow(shellSchema, raw, 'response envelope is invalid')
  const apiVersion = assertSupportedApiVersion(shell.apiVersion)

  // Presence of the key is not enough: JSON.stringify drops `error: undefined`
  // on our own side, but a hand-built or foreign envelope may spell an absent
  // error as `null`, and that is still a success response.
  if (shell['error'] != null) {
    const error = parseOrThrow(errorSchema, shell['error'], 'response error is invalid')
    return { apiVersion, error: normalizeErrorCode(error) }
  }
  return { apiVersion, data: parseOrThrow(schema, shell['data'], 'response payload is invalid') }
}
