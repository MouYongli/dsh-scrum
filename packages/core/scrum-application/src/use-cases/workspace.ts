import { ConflictError, PERMISSION, type Permission, type ProjectId } from '@dsh-scrum/scrum-domain'
import type { ActorContext, UseCaseRequest } from '../actor.js'
import { recordActivity } from '../activity.js'
import { authorizeProject, resolvePermissions } from '../authorization.js'
import type { ApplicationDependencies } from '../dependencies.js'
import type { StoredProject } from '../ports/projects.js'
import type { WorkspaceBinding, WorkspaceRef } from '../ports/workspace.js'

type Dependencies = Pick<
  ApplicationDependencies,
  'projects' | 'members' | 'bindings' | 'capabilities' | 'activity' | 'clock'
>

/**
 * What a workspace turned out to be attached to.
 *
 * A discriminated union rather than a record with nullable fields, so "bound
 * but there is no project" cannot be represented — that state is `stale`, and
 * a caller has to decide what to do about it rather than dereference a null.
 */
export type ResolvedBinding =
  | { readonly state: 'unbound' }
  | { readonly state: 'stale'; readonly binding: WorkspaceBinding }
  | {
      readonly state: 'bound'
      readonly binding: WorkspaceBinding
      readonly project: StoredProject
      readonly permissions: ReadonlySet<Permission>
    }

/**
 * Reports what a workspace is attached to, without deciding whether the caller
 * may use it.
 *
 * No permission is checked and none is required: this answers a question about
 * the workspace, not about the project. The caller's permissions travel back
 * with the answer, so an actor who is not a member is told they are looking at
 * a project they cannot open rather than being told the workspace is unbound.
 *
 * Nothing is written. A read that also stamped a "last verified" time would
 * make opening a workspace a write, and a read-only checkout would stop being
 * openable at all.
 */
export async function resolveWorkspaceBinding(
  deps: Pick<Dependencies, 'projects' | 'members' | 'bindings' | 'capabilities'>,
  request: UseCaseRequest<{ readonly workspace: WorkspaceRef }>,
): Promise<ResolvedBinding> {
  const binding = await deps.bindings.find(request.command.workspace)
  if (binding === null) {
    return { state: 'unbound' }
  }
  const stored = await deps.projects.find(binding.projectId)
  if (stored === null) {
    return { state: 'stale', binding }
  }
  const authorized = await resolvePermissions(deps, request.actor, stored)
  return { state: 'bound', binding, project: stored, permissions: authorized.permissions }
}

export interface BindWorkspaceCommand {
  readonly workspace: WorkspaceRef
  readonly projectId: ProjectId
}

/**
 * Attaches a workspace to a project.
 *
 * `project.view` is the gate: attaching puts a project's data behind a
 * workspace on this machine, so the actor has to be someone the project would
 * have shown it to anyway.
 *
 * No idempotency key. The binding's key is the workspace itself, so a repeat
 * is answered by what is already stored — a recorded key would be a second,
 * weaker way of asking a question the data already answers. Attaching to a
 * different project is refused rather than silently repointed: that is a
 * decision to detach first, and doing it implicitly would move a user's
 * workspace out from under them.
 */
export async function bindWorkspace(
  deps: Dependencies,
  request: UseCaseRequest<BindWorkspaceCommand>,
): Promise<WorkspaceBinding> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.projectView)

  const existing = await deps.bindings.find(command.workspace)
  if (existing !== null) {
    if (existing.projectId === command.projectId) {
      return existing
    }
    throw new ConflictError('this workspace is already bound to another project', 0, 0, {
      projectId: command.projectId,
      boundProjectId: existing.projectId,
    })
  }

  const binding: WorkspaceBinding = {
    workspace: command.workspace,
    projectId: command.projectId,
    linkedBy: actor.identityId,
    linkedAt: deps.clock.now(),
  }
  await deps.bindings.save(binding)
  await report(deps, actor, 'workspace.bind', command.workspace)
  return binding
}

/**
 * Detaches a workspace, returning what was removed or null if nothing was.
 *
 * Deliberately asymmetric with binding: no permission on the project is
 * checked. A stale binding names a project that no longer resolves, and
 * requiring a permission on it would make the one binding that most needs
 * clearing the one binding nobody can clear.
 *
 * Whether detaching is possible at all is the store's answer. In Community the
 * binding is not a record but the presence of `.scrum/project.json`, so
 * removing it would delete the project rather than release it.
 */
export async function unbindWorkspace(
  deps: Pick<Dependencies, 'bindings' | 'activity' | 'clock'>,
  request: UseCaseRequest<{ readonly workspace: WorkspaceRef }>,
): Promise<WorkspaceBinding | null> {
  const { actor, command } = request
  const existing = await deps.bindings.find(command.workspace)
  if (existing === null) {
    return null
  }
  await deps.bindings.remove(command.workspace)
  await report(deps, actor, 'workspace.unbind', command.workspace)
  return existing
}

/**
 * The target is the workspace, not the project. Binding and detaching change
 * which workspace reaches a project; neither changes the project, and neither
 * has a revision to name.
 */
async function report(
  deps: Pick<ApplicationDependencies, 'activity' | 'clock'>,
  actor: ActorContext,
  action: string,
  workspace: WorkspaceRef,
): Promise<void> {
  await recordActivity(deps, actor, {
    action,
    targetType: 'workspace',
    targetId: `${workspace.instanceId}/${workspace.workspaceId}`,
    revision: null,
  })
}
