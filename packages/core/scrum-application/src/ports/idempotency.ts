import {
  ValidationError,
  type Brand,
  type IdentityId,
  type JsonValue,
  type Timestamp,
} from '@dsh-scrum/scrum-domain'

/**
 * A caller-supplied key that makes a retry safe.
 *
 * Trimmed and bounded rather than free text: it becomes a lookup key in
 * whatever store an edition uses, and an unbounded one would be a filename or
 * a column somewhere that cannot hold it.
 */
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>

const MAX_KEY_LENGTH = 200

export function toIdempotencyKey(value: string): IdempotencyKey {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new ValidationError('an idempotency key must not be empty', { value })
  }
  if (trimmed.length > MAX_KEY_LENGTH) {
    throw new ValidationError(`an idempotency key must be at most ${MAX_KEY_LENGTH} characters`, {
      value,
      maxLength: MAX_KEY_LENGTH,
    })
  }
  return trimmed as IdempotencyKey
}

/**
 * What one completed operation left behind.
 *
 * `reference` is a small pointer to the result — an identifier, not the entity
 * — because a replay re-reads the current state rather than handing back a
 * snapshot that may since have moved on. Storing the whole result would make
 * the second caller's view older than the first's.
 *
 * `action` and `actorId` are recorded so a key reused for something else, or
 * by someone else, is caught rather than answered.
 */
export interface IdempotencyRecord {
  readonly key: IdempotencyKey
  readonly action: string
  readonly actorId: IdentityId
  readonly at: Timestamp
  readonly reference: JsonValue
}

/**
 * Where completed operations are remembered.
 *
 * `save` must reject a key that is already stored, with a `ConflictError`.
 * Two concurrent calls carrying the same key both miss the lookup, so the
 * store is the only place the race can be settled; a store that overwrote
 * would let both of them perform the work.
 */
export interface IdempotencyStore {
  find(key: IdempotencyKey): Promise<IdempotencyRecord | null>
  save(record: IdempotencyRecord): Promise<void>
}
