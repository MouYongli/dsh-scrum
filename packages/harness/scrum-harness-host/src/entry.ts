import {
  PROJECT_STATUS,
  type IdentityId,
  type Permission,
  type Project,
  type ProjectConfig,
} from '@dsh-scrum/scrum-domain'
import {
  ACTIVITY_SOURCE,
  resolveWorkspaceBinding,
  type ActorContext,
  type ApplicationDependencies,
  type WorkspaceBinding,
} from '@dsh-scrum/scrum-application'
import {
  fingerprintWorkspacePath,
  workspaceRefOf,
  type HarnessContext,
  type HarnessSession,
  type HarnessWorkspace,
} from './workspace.js'

/**
 * What the plugin finds when it opens.
 *
 * Five states, and the shape of each carries exactly what that state has. A
 * single record with everything nullable would let the client render a project
 * name from a workspace nobody selected.
 */
export type EntryState =
  | { readonly state: 'no-workspace' }
  | { readonly state: 'unbound'; readonly workspace: HarnessWorkspace }
  | {
      readonly state: 'stale'
      readonly workspace: HarnessWorkspace
      readonly binding: WorkspaceBinding
    }
  | {
      readonly state: 'bound' | 'archived'
      readonly workspace: HarnessWorkspace
      readonly binding: WorkspaceBinding
      readonly project: Project
      readonly config: ProjectConfig
      readonly permissions: readonly Permission[]
      /** The workspace is not where it was when it was attached. */
      readonly moved: boolean
    }

/** Builds the actor for a host-initiated call. */
export function hostActor(identityId: IdentityId, session: HarnessSession | null): ActorContext {
  return {
    identityId,
    source: ACTIVITY_SOURCE.ui,
    sessionId: session === null ? null : session.id,
  }
}

/**
 * Reports the entry state.
 *
 * `archived` is its own state rather than a flag on `bound`: an archived
 * project is read-only, and a client that had to remember to check a flag is
 * a client that will offer an edit that the host then refuses.
 *
 * Takes a workspace rather than a nullable one. Whether the user has selected
 * anything is the caller's question, and answering it here as well would leave
 * two places that decide what "nothing selected" means.
 */
export async function describeEntry(
  deps: Pick<ApplicationDependencies, 'projects' | 'members' | 'bindings' | 'capabilities'>,
  harness: HarnessContext,
  actor: ActorContext,
  workspace: HarnessWorkspace,
): Promise<EntryState> {
  const resolved = await resolveWorkspaceBinding(deps, {
    actor,
    command: {
      workspace: workspaceRefOf(harness, workspace),
      pathFingerprint: fingerprintWorkspacePath(workspace.path),
    },
  })
  if (resolved.state === 'unbound') {
    return { state: 'unbound', workspace }
  }
  if (resolved.state === 'stale') {
    return { state: 'stale', workspace, binding: resolved.binding }
  }
  return {
    state: resolved.project.project.status === PROJECT_STATUS.archived ? 'archived' : 'bound',
    workspace,
    binding: resolved.binding,
    project: resolved.project.project,
    config: resolved.project.config,
    permissions: [...resolved.permissions],
    moved: resolved.moved,
  }
}
