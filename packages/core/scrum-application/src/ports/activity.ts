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

/**
 * Where activity goes.
 *
 * Append-only by contract: there is no method to amend or remove a record,
 * because a correction to an audit trail is another record rather than an edit
 * to the one that was wrong.
 */
export interface ActivityRecorder {
  record(event: ActivityEvent): Promise<void>
}
