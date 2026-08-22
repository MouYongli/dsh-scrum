import {
  PROJECT_STATUS,
  ValidationError,
  createEntityMetadata,
  isReadPermission,
  touchEntityMetadata,
  type EntityMetadata,
  type Permission,
  type ProjectStatus,
  type Timestamp,
} from '@dsh-scrum/scrum-domain'

/**
 * How much of Scrum one Harness session may reach.
 *
 * Persisted, so the values may be added to but never renamed. `off` is the
 * default and has to be: a session that reaches a project because nobody
 * turned it off is a session nobody decided to give access to.
 */
export const ACCESS_MODE = {
  off: 'off',
  read: 'read',
  write: 'write',
} as const

export type AccessMode = (typeof ACCESS_MODE)[keyof typeof ACCESS_MODE]

export const ACCESS_MODES: readonly AccessMode[] = Object.values(ACCESS_MODE)

const MODE_VALUES: readonly string[] = ACCESS_MODES

export function toAccessMode(value: string): AccessMode {
  if (!MODE_VALUES.includes(value)) {
    throw new ValidationError(`AccessMode must be one of ${MODE_VALUES.join(', ')}`, { value })
  }
  return value as AccessMode
}

/**
 * One session's access to Scrum, stored per Harness instance and session.
 *
 * It holds the mode and nothing else. No conversation, no tool log, no token:
 * `.scrum/` is committed to the user's repository as often as not, and a
 * field that can hold a secret is a field that will hold one. The type is the
 * enforcement, and a contract test pins the serialized key set so adding one
 * is a visible decision.
 *
 * The project is deliberately absent. Which project a session reaches is the
 * workspace binding's answer, read fresh on every operation; a copy here would
 * keep answering after the binding changed.
 */
export interface SessionAccess extends EntityMetadata {
  readonly harnessInstanceId: string
  readonly sessionId: string
  readonly accessMode: AccessMode
}

export interface CreateSessionAccessInput {
  readonly harnessInstanceId: string
  readonly sessionId: string
  readonly accessMode?: AccessMode | undefined
  readonly now: Timestamp
}

export function createSessionAccess(input: CreateSessionAccessInput): SessionAccess {
  return {
    ...createEntityMetadata(input.now),
    harnessInstanceId: requireReference(input.harnessInstanceId, 'Harness instance id'),
    sessionId: requireReference(input.sessionId, 'Harness session id'),
    accessMode: input.accessMode ?? ACCESS_MODE.off,
  }
}

export function setAccessMode(
  access: SessionAccess,
  accessMode: AccessMode,
  now: Timestamp,
): SessionAccess {
  if (access.accessMode === accessMode) {
    throw new ValidationError(`session access is already ${accessMode}`, {
      sessionId: access.sessionId,
      accessMode,
    })
  }
  return { ...access, ...touchEntityMetadata(access, now), accessMode }
}

const MAX_REFERENCE_LENGTH = 200

function requireReference(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_REFERENCE_LENGTH) {
    throw new ValidationError(`${label} must be between 1 and ${MAX_REFERENCE_LENGTH} characters`, {
      value,
    })
  }
  return trimmed
}

export interface SessionPermissionInput {
  /** What the actor may do in the project: capability, role and policy already intersected. */
  readonly granted: ReadonlySet<Permission>
  readonly mode: AccessMode
  readonly projectStatus: ProjectStatus
}

/**
 * The final answer: capability, role, policy, session and project state, all
 * intersected in one place.
 *
 * One place, because four of these are already decided elsewhere and the fifth
 * is easy to forget. Any caller that computed part of it would be a second
 * answer, and the second answer is the one that stays wrong.
 *
 * Every narrowing here happens on read, never on write. Lowering the mode,
 * archiving the project or losing the binding takes effect on the next call
 * rather than when some stored copy is refreshed.
 */
export function sessionPermissions(input: SessionPermissionInput): ReadonlySet<Permission> {
  if (input.mode === ACCESS_MODE.off) {
    return new Set()
  }
  // An archived project is a record, so write access degrades to read rather
  // than being refused outright: reading a finished project is still useful.
  const readOnly =
    input.mode === ACCESS_MODE.read || input.projectStatus === PROJECT_STATUS.archived
  if (!readOnly) {
    return input.granted
  }
  return new Set([...input.granted].filter(isReadPermission))
}
