import type { Brand } from './brand.js'
import { UnsupportedSchemaVersionError, ValidationError } from './errors.js'
import { INITIAL_REVISION, nextRevision, type Revision } from './revision.js'
import type { Timestamp } from './time.js'

/** Version of the persisted shape of an entity, carried by every stored file. */
export type SchemaVersion = Brand<number, 'SchemaVersion'>

/** Schema version this build writes. */
export const CURRENT_SCHEMA_VERSION = 1 as SchemaVersion

/**
 * Metadata every mutable entity carries. The field names are the persisted
 * names: they appear verbatim in `.scrum/` files and in the API contract.
 */
export interface EntityMetadata {
  readonly schemaVersion: SchemaVersion
  readonly revision: Revision
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}

export function toSchemaVersion(value: number): SchemaVersion {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError('SchemaVersion must be an integer of at least 1', { value })
  }
  return value as SchemaVersion
}

/**
 * Guards a version read from storage. An older version is accepted so that
 * migration can run; a newer one is refused, because writing a shape this
 * build does not understand would corrupt data a newer plugin wrote.
 */
export function assertSupportedSchemaVersion(value: number): SchemaVersion {
  const version = toSchemaVersion(value)
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(CURRENT_SCHEMA_VERSION, version)
  }
  return version
}

export function createEntityMetadata(now: Timestamp): EntityMetadata {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: INITIAL_REVISION,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Metadata for the next accepted write: the revision advances and `updatedAt`
 * moves, while `createdAt` and the schema version stay as they were stored.
 */
export function touchEntityMetadata(metadata: EntityMetadata, now: Timestamp): EntityMetadata {
  return {
    schemaVersion: metadata.schemaVersion,
    revision: nextRevision(metadata.revision),
    createdAt: metadata.createdAt,
    updatedAt: now,
  }
}
