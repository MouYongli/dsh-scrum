import {
  NotFoundError,
  ValidationError,
  type IdentityId,
  type ProjectId,
} from '@dsh-scrum/scrum-domain'
import {
  archiveProject,
  bindWorkspace,
  createProject,
  restoreProject,
  unbindWorkspace,
  type ActorContext,
  type ApplicationDependencies,
  type CreateProjectCommand,
  type StoredProject,
  type WorkspaceBinding,
} from '@dsh-scrum/scrum-application'
import { describeEntry, hostActor, type EntryState } from './entry.js'
import {
  fingerprintWorkspacePath,
  sessionBelongsTo,
  workspaceRefOf,
  type HarnessContext,
  type HarnessSession,
  type HarnessWorkspace,
} from './workspace.js'

/**
 * Version of the surface the client and the agent tools call.
 *
 * The client is loaded into a browser and updated separately from the host, so
 * the two can be different builds. Asking for a version the host does not
 * implement has to fail at the point of asking, with both numbers, rather than
 * as a missing method somewhere deeper.
 */
export const HOST_API_VERSION = 1

export class UnsupportedHostApiVersionError extends ValidationError {
  constructor(requested: number) {
    super(`the Scrum host implements API version ${HOST_API_VERSION}, not ${requested}`, {
      requested,
      implemented: HOST_API_VERSION,
    })
  }
}

/** What the plugin needs from its edition: an identity, and stores per workspace. */
export interface ScrumRuntime {
  identity(): Promise<IdentityId>
  /**
   * The application ports bound to one workspace. Called per request rather
   * than once, so a workspace that is closed and reopened does not keep
   * writing through handles to a directory that has moved.
   */
  forWorkspace(workspace: HarnessWorkspace): Promise<ApplicationDependencies>
}

/** Everything the host resolved before running one call. */
export interface HostRequestContext {
  readonly deps: ApplicationDependencies
  readonly actor: ActorContext
  readonly workspace: HarnessWorkspace
  readonly session: HarnessSession | null
}

/** Creating the project and attaching the workspace is one act, so one command. */
export type InitialiseWorkspaceCommand = CreateProjectCommand

export interface ScrumHostApi {
  readonly version: number
  entry(): Promise<EntryState>
  /** Creates a project and attaches this workspace to it, which is one act. */
  initialise(command: InitialiseWorkspaceCommand): Promise<StoredProject>
  attach(projectId: ProjectId): Promise<WorkspaceBinding>
  detach(): Promise<WorkspaceBinding | null>
  archive(): Promise<StoredProject>
  restore(): Promise<StoredProject>
}

/**
 * Resolves the workspace, the session and the stores for one call.
 *
 * Everything comes from the Harness context, never from the filesystem: the
 * host must not work out which workspace is open by looking around, because
 * the answer would be a guess that can disagree with what the user sees.
 */
export async function resolveRequest(
  harness: HarnessContext,
  runtime: ScrumRuntime,
): Promise<HostRequestContext> {
  const workspace = await harness.currentWorkspace()
  if (workspace === null) {
    throw new ValidationError('no workspace is selected', {})
  }
  const session = await currentSessionOf(harness, workspace)
  return {
    deps: await runtime.forWorkspace(workspace),
    actor: hostActor(await runtime.identity(), session),
    workspace,
    session,
  }
}

/** The open session, or null when it belongs to a different workspace. */
async function currentSessionOf(
  harness: HarnessContext,
  workspace: HarnessWorkspace,
): Promise<HarnessSession | null> {
  const session = await harness.currentSession()
  return sessionBelongsTo(session, workspace) ? session : null
}

/** The project this workspace is attached to, or a refusal naming the state. */
export async function requireBoundProject(
  request: HostRequestContext,
  harness: HarnessContext,
): Promise<{ binding: WorkspaceBinding; project: StoredProject }> {
  const entry = await describeEntry(request.deps, harness, request.actor, request.workspace)
  if (entry.state === 'no-workspace' || entry.state === 'unbound') {
    throw new ValidationError('this workspace is not bound to a Scrum project', {
      workspaceId: request.workspace.id,
    })
  }
  if (entry.state === 'stale') {
    throw new NotFoundError('project', entry.binding.projectId, {
      workspaceId: request.workspace.id,
    })
  }
  return { binding: entry.binding, project: { project: entry.project, config: entry.config } }
}

export function createHostApi(harness: HarnessContext, runtime: ScrumRuntime): ScrumHostApi {
  async function boundProjectId(request: HostRequestContext): Promise<ProjectId> {
    return (await requireBoundProject(request, harness)).project.project.id
  }

  return {
    version: HOST_API_VERSION,

    async entry(): Promise<EntryState> {
      const workspace = await harness.currentWorkspace()
      if (workspace === null) {
        return { state: 'no-workspace' }
      }
      const deps = await runtime.forWorkspace(workspace)
      const actor = hostActor(await runtime.identity(), await currentSessionOf(harness, workspace))
      return await describeEntry(deps, harness, actor, workspace)
    },

    async initialise(command: InitialiseWorkspaceCommand): Promise<StoredProject> {
      const request = await resolveRequest(harness, runtime)
      const stored = await createProject(request.deps, { actor: request.actor, command })
      await bindWorkspace(request.deps, {
        actor: request.actor,
        command: {
          workspace: workspaceRefOf(harness, request.workspace),
          projectId: stored.project.id,
          pathFingerprint: fingerprintWorkspacePath(request.workspace.path),
        },
      })
      return stored
    },

    async attach(projectId: ProjectId): Promise<WorkspaceBinding> {
      const request = await resolveRequest(harness, runtime)
      return await bindWorkspace(request.deps, {
        actor: request.actor,
        command: {
          workspace: workspaceRefOf(harness, request.workspace),
          projectId,
          pathFingerprint: fingerprintWorkspacePath(request.workspace.path),
        },
      })
    },

    async detach(): Promise<WorkspaceBinding | null> {
      const request = await resolveRequest(harness, runtime)
      return await unbindWorkspace(request.deps, {
        actor: request.actor,
        command: { workspace: workspaceRefOf(harness, request.workspace) },
      })
    },

    async archive(): Promise<StoredProject> {
      const request = await resolveRequest(harness, runtime)
      return await archiveProject(request.deps, {
        actor: request.actor,
        command: { projectId: await boundProjectId(request) },
      })
    },

    async restore(): Promise<StoredProject> {
      const request = await resolveRequest(harness, runtime)
      return await restoreProject(request.deps, {
        actor: request.actor,
        command: { projectId: await boundProjectId(request) },
      })
    },
  }
}
