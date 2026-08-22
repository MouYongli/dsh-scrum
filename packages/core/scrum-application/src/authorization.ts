import {
  NotFoundError,
  assertPermission,
  effectivePermissions,
  memberRoles,
  type Permission,
  type PermissionContext,
  type ProjectId,
  type ProjectRole,
} from '@dsh-scrum/scrum-domain'
import type { ActorContext } from './actor.js'
import type { ApplicationDependencies } from './dependencies.js'
import type { StoredProject } from './ports/projects.js'

type Dependencies = Pick<ApplicationDependencies, 'projects' | 'members' | 'capabilities'>

/** A project, loaded together with what this actor may do to it. */
export interface AuthorizedProject extends StoredProject {
  readonly roles: readonly ProjectRole[]
  readonly permissions: ReadonlySet<Permission>
}

export async function loadProject(
  deps: Pick<ApplicationDependencies, 'projects'>,
  id: ProjectId,
): Promise<StoredProject> {
  const stored = await deps.projects.find(id)
  if (stored === null) {
    throw new NotFoundError('project', id)
  }
  return stored
}

/**
 * Resolves what an actor may do in a project.
 *
 * A missing membership and a suspended one both come out as no roles, and no
 * roles produces an empty permission set. That is one path rather than a
 * special case: an actor who is not a member is refused by the same check that
 * refuses a member who lacks the role, so there is nowhere for a "but the
 * project has no members yet" branch to creep in.
 */
export async function resolvePermissions(
  deps: Dependencies,
  actor: ActorContext,
  stored: StoredProject,
): Promise<AuthorizedProject> {
  const member = await deps.members.find(stored.project.id, actor.identityId)
  const roles = member === null ? [] : memberRoles(member)
  return { ...stored, roles, permissions: effectivePermissions(contextFor(deps, stored, roles)) }
}

/** The three inputs a permission decision takes, gathered from what was loaded. */
function contextFor(
  deps: Pick<ApplicationDependencies, 'capabilities'>,
  stored: StoredProject,
  roles: readonly ProjectRole[],
): PermissionContext {
  return { roles, capabilities: deps.capabilities, policy: stored.config.permissionPolicy }
}

/**
 * The guard every use case that touches an existing project runs first.
 *
 * It returns what it loaded, so the use case does not read the project a
 * second time. Reading twice would not only cost two reads, it would let the
 * decision be made against one version and the change against another.
 */
export async function authorizeProject(
  deps: Dependencies,
  actor: ActorContext,
  projectId: ProjectId,
  permission: Permission,
): Promise<AuthorizedProject> {
  const authorized = await resolvePermissions(deps, actor, await loadProject(deps, projectId))
  assertPermission(contextFor(deps, authorized, authorized.roles), permission)
  return authorized
}
