import type { Brand } from './brand.js'
import { ValidationError } from './errors.js'

/**
 * Optimistic concurrency counter. Every successful write increments it by one,
 * so a caller that submits a stale value is rejected instead of overwriting a
 * change it never saw.
 */
export type Revision = Brand<number, 'Revision'>

/** Revision of an entity that has just been created. */
export const INITIAL_REVISION = 1 as Revision

export function toRevision(value: number): Revision {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError('Revision must be an integer of at least 1', { value })
  }
  return value as Revision
}

export function nextRevision(current: Revision): Revision {
  return toRevision(current + 1)
}
