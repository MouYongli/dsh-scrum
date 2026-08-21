import {
  UnsupportedSchemaVersionError,
  ValidationError,
  isScrumError,
} from '@dsh-scrum/scrum-domain'

/**
 * Readers for the untyped result of `JSON.parse`.
 *
 * They only establish that a value has the JSON type the field is stored as.
 * What counts as a valid identifier, timestamp, status or title is decided by
 * the domain constructors these feed, so there is one definition of each rule
 * rather than a second copy here that could drift from it.
 */
export type JsonRecord = Record<string, unknown>

export function asRecord(value: unknown, field: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${field} must be an object`, { field, found: describe(value) })
  }
  return value as JsonRecord
}

export function stringField(record: JsonRecord, field: string): string {
  const value = record[field]
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`, { field, found: describe(value) })
  }
  return value
}

export function numberField(record: JsonRecord, field: string): number {
  const value = record[field]
  if (typeof value !== 'number') {
    throw new ValidationError(`${field} must be a number`, { field, found: describe(value) })
  }
  return value
}

export function booleanField(record: JsonRecord, field: string): boolean {
  const value = record[field]
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${field} must be a boolean`, { field, found: describe(value) })
  }
  return value
}

/**
 * A nullable field. `null` is the stored spelling of absent, and a missing key
 * is refused rather than treated as null: a file that lost a field during a
 * partial write would otherwise read as a deliberate absence.
 */
export function nullableField<Value>(
  record: JsonRecord,
  field: string,
  read: (record: JsonRecord, field: string) => Value,
): Value | null {
  if (!(field in record)) {
    throw new ValidationError(`${field} is missing`, { field })
  }
  return record[field] === null ? null : read(record, field)
}

export function arrayField(record: JsonRecord, field: string): readonly unknown[] {
  const value = record[field]
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array`, { field, found: describe(value) })
  }
  return value
}

export function stringArrayField(record: JsonRecord, field: string): readonly string[] {
  return arrayField(record, field).map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new ValidationError(`${field}[${index}] must be a string`, {
        field,
        index,
        found: describe(entry),
      })
    }
    return entry
  })
}

/** What was found instead, for a diagnostic that does not echo the value back. */
function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * Runs a decoder and attaches the file it was reading to whatever it throws.
 *
 * A decode failure has to name the file. A store holding hundreds of work
 * items produces the same message for every one of them, and "title must be a
 * string" with no path is a diagnostic the user cannot act on.
 *
 * A file written by a newer build keeps its own error code rather than being
 * folded into a validation failure. The two need opposite responses — one
 * wants a migration or a newer plugin, the other wants the file repaired — and
 * a caller that had to read a detail field to tell them apart would eventually
 * stop bothering.
 */
export function decodingFile<Value>(file: string, decode: () => Value): Value {
  try {
    return decode()
  } catch (error) {
    if (!isScrumError(error)) {
      throw error
    }
    if (error instanceof UnsupportedSchemaVersionError) {
      throw new UnsupportedSchemaVersionError(error.supportedVersion, error.foundVersion, {
        ...error.details,
        file,
      })
    }
    throw new ValidationError(`${file} is not a readable Scrum file: ${error.message}`, {
      ...error.details,
      file,
    })
  }
}
