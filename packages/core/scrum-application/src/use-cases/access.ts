import {
  CAPABILITIES,
  CAPABILITY,
  PROJECT_STATUS,
  isReadPermission,
  PERMISSION,
  type Capability,
  type Permission,
  type ProjectId,
  type ProjectRole,
} from '@dsh-scrum/scrum-domain'
import type { UseCaseRequest } from '../actor.js'
import { authorizeProject } from '../authorization.js'
import type { ApplicationDependencies } from '../dependencies.js'

type Dependencies = Pick<ApplicationDependencies, 'projects' | 'members' | 'capabilities'>

export interface ResolveProjectAuthorizationCommand {
  readonly projectId: ProjectId
}

/** The current user's effective access to one project, independent of a conversation. */
export interface ProjectAuthorization {
  readonly permissions: ReadonlySet<Permission>
  /**
   * What this installation provides, which is not about the person.
   *
   * A screen needs both answers to say anything useful about a control it
   * cannot offer: without a permission is "you may not", without a capability
   * is "this edition does not do that". A page holding only the first has to
   * present the second as a button that does nothing.
   */
  readonly capabilities: readonly Capability[]
  readonly projectArchived: boolean
  readonly membership: {
    readonly mode: 'personal' | 'managed'
    readonly roles: readonly ProjectRole[]
  }
}

/**
 * Resolves authorization from the project and current actor on every call.
 * A Harness session may identify the source of an activity, but never narrows
 * this result: every conversation in one workspace acts as the same user.
 */
export async function resolveProjectAuthorization(
  deps: Dependencies,
  request: UseCaseRequest<ResolveProjectAuthorizationCommand>,
): Promise<ProjectAuthorization> {
  const authorized = await authorizeProject(
    deps,
    request.actor,
    request.command.projectId,
    PERMISSION.projectView,
  )
  const projectArchived = authorized.project.status === PROJECT_STATUS.archived
  return {
    capabilities: CAPABILITIES.filter((capability) => deps.capabilities.has(capability)),
    permissions: projectArchived
      ? new Set([...authorized.permissions].filter(isReadPermission))
      : authorized.permissions,
    projectArchived,
    membership: {
      mode: deps.capabilities.has(CAPABILITY.rbac) ? 'managed' : 'personal',
      roles: authorized.roles,
    },
  }
}
