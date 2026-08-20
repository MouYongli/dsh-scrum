import { ERROR_CODE, ScrumError, type ErrorDetails } from '@dsh-scrum/scrum-domain'

/** API version this build implements. Every envelope carries it explicitly. */
export const API_VERSION = 1

export type ApiVersion = typeof API_VERSION

/**
 * Versions this build can still read. A version is added here only while the
 * build genuinely accepts payloads shaped that way; removing one is a
 * breaking change for every client that has not been upgraded.
 */
export const SUPPORTED_API_VERSIONS: readonly number[] = [API_VERSION]

/**
 * A caller asked for a version this build does not implement. Kept distinct
 * from a validation failure: the payload may be perfectly well formed, and the
 * fix is to upgrade one side rather than to correct a field.
 */
export class UnsupportedApiVersionError extends ScrumError {
  readonly requestedVersion: number
  readonly supportedVersions: readonly number[]

  constructor(requestedVersion: number, details: ErrorDetails = {}) {
    super(
      ERROR_CODE.unsupportedApiVersion,
      `api version ${requestedVersion} is not supported; this build implements ${SUPPORTED_API_VERSIONS.join(', ')}`,
      { ...details, requestedVersion, supportedVersions: [...SUPPORTED_API_VERSIONS] },
    )
    this.requestedVersion = requestedVersion
    this.supportedVersions = SUPPORTED_API_VERSIONS
  }
}

export function isSupportedApiVersion(value: number): value is ApiVersion {
  return SUPPORTED_API_VERSIONS.includes(value)
}

export function assertSupportedApiVersion(value: number): ApiVersion {
  if (!isSupportedApiVersion(value)) {
    throw new UnsupportedApiVersionError(value)
  }
  return value
}
