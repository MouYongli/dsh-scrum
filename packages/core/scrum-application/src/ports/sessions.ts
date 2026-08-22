import type { SessionAccess } from '../session-access.js'

/**
 * Where a session's access mode is remembered.
 *
 * Keyed by the instance and the session together: session ids are stable only
 * inside one Harness installation, so a bare session id would let two machines
 * share an answer neither of them gave.
 *
 * A session nobody has decided about is absent, not `off` — the two are the
 * same answer today, and keeping them distinguishable is what lets a UI say
 * "not enabled" rather than "turned off".
 */
export interface SessionAccessRepository {
  find(harnessInstanceId: string, sessionId: string): Promise<SessionAccess | null>
  save(access: SessionAccess): Promise<void>
}
