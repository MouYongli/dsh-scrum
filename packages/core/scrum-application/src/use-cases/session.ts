import { PERMISSION, type Permission, type ProjectId } from '@dsh-scrum/scrum-domain'
import type { UseCaseRequest } from '../actor.js'
import { recordActivity } from '../activity.js'
import { authorizeProject } from '../authorization.js'
import type { ApplicationDependencies } from '../dependencies.js'
import {
  ACCESS_MODE,
  createSessionAccess,
  sessionPermissions,
  setAccessMode,
  type AccessMode,
  type SessionAccess,
} from '../session-access.js'

type Dependencies = Pick<
  ApplicationDependencies,
  'projects' | 'members' | 'sessions' | 'capabilities' | 'activity' | 'clock'
>

export interface SessionRef {
  readonly harnessInstanceId: string
  readonly sessionId: string
}

/**
 * What a session may currently do, and why it may do that much.
 *
 * The mode travels back with the permissions because a caller that sees an
 * empty set needs to know whether Scrum is switched off for this session or
 * the actor simply has no roles, and those call for different advice.
 */
export interface SessionAuthorization {
  readonly mode: AccessMode
  readonly permissions: ReadonlySet<Permission>
  /** What the actor would hold with an unrestricted session. */
  readonly granted: ReadonlySet<Permission>
}

/** The stored mode, or `off` for a session nobody has decided about. */
export async function readSessionAccess(
  deps: Pick<Dependencies, 'sessions'>,
  session: SessionRef,
): Promise<AccessMode> {
  const stored = await deps.sessions.find(session.harnessInstanceId, session.sessionId)
  return stored?.accessMode ?? ACCESS_MODE.off
}

export interface SetSessionAccessCommand extends SessionRef {
  readonly projectId: ProjectId
  readonly mode: AccessMode
}

/**
 * Changes what a session may reach.
 *
 * Takes `project.view`, so a session cannot be handed access to a project the
 * actor could not open in the first place. It is recorded: turning Scrum write
 * access on for an agent is the decision every later agent write rests on.
 */
export async function setSessionAccess(
  deps: Dependencies,
  request: UseCaseRequest<SetSessionAccessCommand>,
): Promise<SessionAccess> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.projectView)

  const now = deps.clock.now()
  const stored = await deps.sessions.find(command.harnessInstanceId, command.sessionId)
  const access =
    stored === null
      ? createSessionAccess({ ...command, accessMode: command.mode, now })
      : setAccessMode(stored, command.mode, now)
  await deps.sessions.save(access)
  await recordActivity(deps, actor, {
    action: 'session.access',
    targetType: 'session',
    targetId: `${command.harnessInstanceId}/${command.sessionId}`,
    revision: access.revision,
  })
  return access
}

export interface ResolveSessionCommand extends SessionRef {
  readonly projectId: ProjectId
}

/**
 * Computes what a session may do, right now.
 *
 * Nothing here is cached. The session mode, the project's status and the
 * actor's roles are all read on the call, so lowering the mode or archiving
 * the project takes effect on the next operation rather than when something
 * remembers to refresh.
 */
export async function resolveSessionAuthorization(
  deps: Pick<Dependencies, 'projects' | 'members' | 'sessions' | 'capabilities'>,
  request: UseCaseRequest<ResolveSessionCommand>,
): Promise<SessionAuthorization> {
  const { actor, command } = request
  const authorized = await authorizeProject(deps, actor, command.projectId, PERMISSION.projectView)
  const mode = await readSessionAccess(deps, command)
  return {
    mode,
    granted: authorized.permissions,
    permissions: sessionPermissions({
      granted: authorized.permissions,
      mode,
      projectStatus: authorized.project.status,
    }),
  }
}
