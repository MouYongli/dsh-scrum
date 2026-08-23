import {
  ValidationError,
  type IdentityId,
  type Revision,
  type Timestamp,
} from '@dsh-scrum/scrum-domain'

/**
 * Where a change came from.
 *
 * Persisted, so the values may be added to but never renamed. `system` covers
 * a change no person asked for directly — a recovery pass or a migration —
 * which has to be distinguishable from one a user made, or the audit trail
 * would attribute the tool's own repairs to whoever happened to open the
 * workspace.
 */
export const ACTIVITY_SOURCE = {
  ui: 'ui',
  agent: 'agent',
  api: 'api',
  automation: 'automation',
  system: 'system',
} as const

export type ActivitySource = (typeof ACTIVITY_SOURCE)[keyof typeof ACTIVITY_SOURCE]

export const ACTIVITY_SOURCES: readonly ActivitySource[] = Object.values(ACTIVITY_SOURCE)

const SOURCE_VALUES: readonly string[] = ACTIVITY_SOURCES

export function toActivitySource(value: string): ActivitySource {
  if (!SOURCE_VALUES.includes(value)) {
    throw new ValidationError(`ActivitySource must be one of ${SOURCE_VALUES.join(', ')}`, {
      value,
    })
  }
  return value as ActivitySource
}

/** What a use case reports about a change it has already made. */
export interface ActivityDescription {
  readonly action: string
  readonly targetType: string
  readonly targetId: string
  /** The revision the change produced, or null for a target that has none. */
  readonly revision: Revision | null
}

/** A description with the actor, source and instant filled in. */
export interface ActivityEvent extends ActivityDescription {
  readonly at: Timestamp
  readonly actorId: IdentityId
  readonly source: ActivitySource
  readonly sessionId: string | null
}

/** What a caller wants back out of the log. */
export interface ActivityWindow {
  /** At most this many events. The log has no default; the caller decides. */
  readonly limit: number
  /** Nothing recorded before this instant. */
  readonly since?: Timestamp | undefined
}

/**
 * What the log could read back, and what it could not.
 *
 * The problems travel with the events rather than being thrown, because a
 * history that is missing one line is still worth showing — and a history
 * that quietly returns fewer events than it holds is one that lies about what
 * happened. Each is a sentence a user can act on; the log's own storage shape
 * stays behind the port.
 */
export interface ActivityHistory {
  /** Newest first, which is the order anything asking for "recent" wants. */
  readonly events: readonly ActivityEvent[]
  readonly problems: readonly string[]
}

/**
 * Where activity goes, and where it is read back from.
 *
 * Append-only by contract: there is no method to amend or remove a record,
 * because a correction to an audit trail is another record rather than an edit
 * to the one that was wrong.
 *
 * Reading and writing are one port because they are one format. An edition
 * that ships events to a service queries that service; an edition that appends
 * to files reads those files. Splitting them would let a composition pair a
 * writer with a reader that cannot see what it wrote.
 */
export interface ActivityLog {
  record(event: ActivityEvent): Promise<void>
  read(window: ActivityWindow): Promise<ActivityHistory>
}
