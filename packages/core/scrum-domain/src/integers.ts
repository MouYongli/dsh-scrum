import { ValidationError } from './errors.js'

/**
 * Shared guard for the counters that start at one: revisions, schema versions
 * and the sequence numbers inside derived identifiers. Internal — each caller
 * exposes its own branded constructor instead.
 */
export function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be an integer of at least 1`, { value })
  }
  return value
}
