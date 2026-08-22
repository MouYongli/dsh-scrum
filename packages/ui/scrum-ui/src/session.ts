import { isReadPermission, type Permission } from '@dsh-scrum/scrum-domain'

/**
 * How much of Scrum the agent may reach in this session.
 *
 * The values are the ones the store persists and the host names, declared here
 * rather than imported so this package stays free of the application layer. A
 * workspace test asserts the two vocabularies are the same set, so a value
 * added on one side is a failing test rather than a silent divergence.
 *
 * `off` is first because it is the default, and it has to be: a session that
 * reaches a project because nobody turned it off is a session nobody decided
 * to give access to.
 */
export const SCRUM_ACCESS_MODE = {
  off: 'off',
  read: 'read',
  write: 'write',
} as const

export type AccessMode = (typeof SCRUM_ACCESS_MODE)[keyof typeof SCRUM_ACCESS_MODE]

export const SCRUM_ACCESS_MODES: readonly AccessMode[] = [
  SCRUM_ACCESS_MODE.off,
  SCRUM_ACCESS_MODE.read,
  SCRUM_ACCESS_MODE.write,
]

/**
 * What the host answered about this session.
 *
 * `granted` is what the actor's roles and the edition's capabilities allow in
 * the project; `permissions` is what survives after the session mode and the
 * project's state narrow it. Both are needed: the difference between them is
 * the whole explanation of why a chosen mode is not in force.
 */
export interface SessionView {
  readonly mode: AccessMode
  readonly granted: readonly Permission[]
  readonly permissions: readonly Permission[]
  readonly projectArchived: boolean
}

/**
 * Why the session reaches less than the mode the user picked.
 *
 * Each is something that happened outside this screen: the project was
 * archived, the actor's roles no longer allow writing, or the workspace is no
 * longer attached to a project at all. None of them is undone by choosing a
 * mode again, which is exactly why they have to be said rather than left for
 * the user to infer from a control that does nothing.
 */
export type SessionDegradation = 'archived' | 'roles' | 'binding'

export interface SessionSummary {
  /** What the user chose, which is what the store holds. */
  readonly chosen: AccessMode
  /** What the session can actually do right now. */
  readonly effective: AccessMode
  readonly degradations: readonly SessionDegradation[]
}

/**
 * The mode a permission set amounts to.
 *
 * Read from the permissions rather than from the stored mode, because the
 * stored mode is a request and the permissions are the answer. A screen that
 * showed the request would tell a user they have write access right up until
 * the agent is refused.
 */
export function effectiveMode(permissions: readonly Permission[]): AccessMode {
  if (permissions.length === 0) {
    return SCRUM_ACCESS_MODE.off
  }
  return permissions.some((permission) => !isReadPermission(permission))
    ? SCRUM_ACCESS_MODE.write
    : SCRUM_ACCESS_MODE.read
}

/** Whether the roles alone would allow writing, before the session narrows. */
function rolesAllowWriting(granted: readonly Permission[]): boolean {
  return granted.some((permission) => !isReadPermission(permission))
}

export function describeSession(view: SessionView, bound: boolean): SessionSummary {
  const effective = bound ? effectiveMode(view.permissions) : SCRUM_ACCESS_MODE.off
  const degradations: SessionDegradation[] = []
  if (effective !== view.mode) {
    if (!bound) {
      degradations.push('binding')
    }
    if (view.projectArchived) {
      degradations.push('archived')
    }
    if (bound && !rolesAllowWriting(view.granted)) {
      degradations.push('roles')
    }
  }
  return { chosen: view.mode, effective, degradations }
}
