import {
  PROJECT_STATUS,
  isReadPermission,
  PERMISSION,
  type Permission,
  type ProjectId,
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
  readonly projectArchived: boolean
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
    permissions: projectArchived
      ? new Set([...authorized.permissions].filter(isReadPermission))
      : authorized.permissions,
    projectArchived,
  }
}
