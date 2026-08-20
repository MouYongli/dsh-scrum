import type { Brand } from './brand.js'
import { requirePositiveInteger } from './integers.js'

/**
 * Optimistic concurrency counter. Every successful write increments it by one,
 * so a caller that submits a stale value is rejected instead of overwriting a
 * change it never saw.
 */
export type Revision = Brand<number, 'Revision'>

/** Revision of an entity that has just been created. */
export const INITIAL_REVISION = 1 as Revision

export function toRevision(value: number): Revision {
  return requirePositiveInteger(value, 'Revision') as Revision
}

export function nextRevision(current: Revision): Revision {
  return toRevision(current + 1)
}
