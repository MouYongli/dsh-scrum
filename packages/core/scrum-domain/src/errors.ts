/**
 * Stable error codes. The string values are part of the contract with the API
 * layer, the Agent tools and the UI: they are matched on, logged and mapped to
 * user-facing messages, so they may be added to but never renamed.
 */
export const ERROR_CODE = {
  validation: 'VALIDATION',
  conflict: 'CONFLICT',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  unsupportedSchemaVersion: 'UNSUPPORTED_SCHEMA_VERSION',
} as const

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]

/** Structured, JSON-serializable context carried alongside an error code. */
export type ErrorDetails = Record<string, string | number | boolean | null>

export interface SerializedScrumError {
  readonly code: ErrorCode
  readonly message: string
  readonly details: ErrorDetails
}

export abstract class ScrumError extends Error {
  readonly code: ErrorCode
  readonly details: ErrorDetails

  protected constructor(code: ErrorCode, message: string, details: ErrorDetails = {}) {
    super(message)
    this.name = new.target.name
    this.code = code
    this.details = details
  }
}

/** Input violates a domain rule or a value format. */
export class ValidationError extends ScrumError {
  constructor(message: string, details: ErrorDetails = {}) {
    super(ERROR_CODE.validation, message, details)
  }
}

/**
 * A write was rejected because the caller worked from an outdated read. Both
 * revisions travel with the error so that the caller can decide whether to
 * retry without reading the entity again.
 */
export class ConflictError extends ScrumError {
  readonly expectedRevision: number
  readonly actualRevision: number

  constructor(
    message: string,
    expectedRevision: number,
    actualRevision: number,
    details: ErrorDetails = {},
  ) {
    super(ERROR_CODE.conflict, message, { ...details, expectedRevision, actualRevision })
    this.expectedRevision = expectedRevision
    this.actualRevision = actualRevision
  }
}

/** The actor is known but not allowed to perform the operation. */
export class ForbiddenError extends ScrumError {
  constructor(message: string, details: ErrorDetails = {}) {
    super(ERROR_CODE.forbidden, message, details)
  }
}

/** The referenced entity does not exist, or is not visible to the actor. */
export class NotFoundError extends ScrumError {
  readonly resourceType: string
  readonly resourceId: string

  constructor(resourceType: string, resourceId: string, details: ErrorDetails = {}) {
    super(ERROR_CODE.notFound, `${resourceType} ${resourceId} was not found`, {
      ...details,
      resourceType,
      resourceId,
    })
    this.resourceType = resourceType
    this.resourceId = resourceId
  }
}

/**
 * Stored data carries a schema version this build does not understand. Writing
 * anyway would corrupt data produced by a newer plugin, so callers must treat
 * the source as read-only.
 */
export class UnsupportedSchemaVersionError extends ScrumError {
  readonly supportedVersion: number
  readonly foundVersion: number

  constructor(supportedVersion: number, foundVersion: number, details: ErrorDetails = {}) {
    super(
      ERROR_CODE.unsupportedSchemaVersion,
      `schema version ${foundVersion} is not supported by this build, which understands version ${supportedVersion}`,
      { ...details, supportedVersion, foundVersion },
    )
    this.supportedVersion = supportedVersion
    this.foundVersion = foundVersion
  }
}

export function isScrumError(value: unknown): value is ScrumError {
  return value instanceof ScrumError
}

/**
 * Reduces a domain error to the shape that crosses a process boundary. Errors
 * from other sources are deliberately not accepted: their messages may carry
 * filesystem paths or credentials and must not be forwarded verbatim.
 */
export function serializeScrumError(error: ScrumError): SerializedScrumError {
  return { code: error.code, message: error.message, details: { ...error.details } }
}
