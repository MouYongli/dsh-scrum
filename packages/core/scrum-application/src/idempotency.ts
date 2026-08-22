import {
  ConflictError,
  ForbiddenError,
  ValidationError,
  type JsonValue,
} from '@dsh-scrum/scrum-domain'
import type { ActorContext } from './actor.js'
import type { ApplicationDependencies } from './dependencies.js'
import { toIdempotencyKey, type IdempotencyKey } from './ports/idempotency.js'

type Dependencies = Pick<ApplicationDependencies, 'idempotency' | 'clock'>

/** What performing an operation produced, and the pointer worth remembering. */
export interface IdempotentOutcome<Result> {
  /** A small pointer to what was created or changed, usually an identifier. */
  readonly reference: JsonValue
  readonly result: Result
}

export interface IdempotentOperation<Result> {
  /** Names the operation, so a key reused for a different one is caught. */
  readonly action: string
  readonly key?: string | undefined
  perform(): Promise<IdempotentOutcome<Result>>
  /** Rebuilds the result from the pointer a previous attempt stored. */
  replay(reference: JsonValue): Promise<Result>
}

/**
 * Runs an operation at most once per key.
 *
 * Without a key the operation simply runs: most calls cannot be retried
 * blindly and do not need the bookkeeping. With one, a second call replays
 * rather than repeats.
 *
 * A replay re-reads through `replay` instead of returning a stored snapshot,
 * so the retrying caller sees the same state a first-time caller would rather
 * than a view frozen at the moment of the original call.
 */
export async function runIdempotently<Result>(
  deps: Dependencies,
  actor: ActorContext,
  operation: IdempotentOperation<Result>,
): Promise<Result> {
  if (operation.key === undefined) {
    return (await operation.perform()).result
  }
  const key = toIdempotencyKey(operation.key)

  const existing = await deps.idempotency.find(key)
  if (existing !== null) {
    return await operation.replay(assertReplayable(existing, actor, operation.action, key))
  }

  const outcome = await operation.perform()
  try {
    await deps.idempotency.save({
      key,
      action: operation.action,
      actorId: actor.identityId,
      at: deps.clock.now(),
      reference: outcome.reference,
    })
  } catch (error) {
    // Two callers with one key both missed the lookup and both performed the
    // work; the store settled it. Losing the race is not an error to report,
    // it is the answer to the question the key was asking.
    if (!(error instanceof ConflictError)) {
      throw error
    }
  }
  return outcome.result
}

/**
 * A key answers for one operation by one actor.
 *
 * Reusing it for something else is a caller bug that would otherwise be
 * answered with an unrelated result, and reusing someone else's would hand
 * over a reference to work they did.
 */
function assertReplayable(
  record: { action: string; actorId: string; reference: JsonValue },
  actor: ActorContext,
  action: string,
  key: IdempotencyKey,
): JsonValue {
  if (record.action !== action) {
    throw new ValidationError('this idempotency key was used for a different operation', {
      key,
      action,
      storedAction: record.action,
    })
  }
  if (record.actorId !== actor.identityId) {
    throw new ForbiddenError('this idempotency key belongs to another actor', { key, action })
  }
  return record.reference
}

/**
 * Reads back a reference a previous attempt stored.
 *
 * Every reference this application writes is an identifier, so anything else
 * came from a store holding a record it did not write, and answering from it
 * would be worse than refusing.
 */
export function stringReference(reference: JsonValue): string {
  if (typeof reference !== 'string') {
    throw new ValidationError('the stored idempotency reference is not an identifier', {
      reference,
    })
  }
  return reference
}
