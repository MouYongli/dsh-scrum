import { ConflictError, type JsonValue } from '@dsh-scrum/scrum-domain'

/**
 * What a write tool reports.
 *
 * A discriminated result rather than a thrown error, because a stale revision
 * is not a malfunction: it is news the model has to act on, and news arrives
 * better as data it can read than as a failure it has to parse out of a
 * message.
 */
export type WriteOutcome =
  | { readonly ok: true; readonly result: JsonValue }
  | {
      readonly ok: false
      readonly reason: 'conflict'
      readonly entityType: string
      readonly entityId: string
      readonly expectedRevision: number
      readonly currentRevision: number
      readonly advice: string
    }

const ADVICE =
  'Read the entity again, apply the change to the revision you get back, and call this tool ' +
  'once more with that revision. Do not repeat the call with the revision you already used.'

/**
 * Turns a stale revision into an instruction.
 *
 * Naming the current revision without saying what to do with it invites the
 * model to resend the same call with the number it was just given, which is
 * how a lost update gets written deliberately. The advice is the part that
 * makes the result actionable.
 */
export function conflictOutcome(error: ConflictError): WriteOutcome {
  const details = error.details as Record<string, unknown>
  return {
    ok: false,
    reason: 'conflict',
    entityType: typeof details['entityType'] === 'string' ? details['entityType'] : 'entity',
    entityId: typeof details['entityId'] === 'string' ? details['entityId'] : '',
    expectedRevision: error.expectedRevision,
    currentRevision: error.actualRevision,
    advice: ADVICE,
  }
}

/**
 * Runs one write and reports a conflict rather than throwing it.
 *
 * Nothing is retried here. A retry that reused the caller's expectation would
 * be an overwrite wearing a retry's clothes, and one that re-read and reapplied
 * would be the tool deciding on the user's behalf what their change meant
 * against somebody else's.
 */
export async function attemptWrite(run: () => Promise<JsonValue>): Promise<WriteOutcome> {
  try {
    return { ok: true, result: await run() }
  } catch (error) {
    if (error instanceof ConflictError) {
      return conflictOutcome(error)
    }
    throw error
  }
}
