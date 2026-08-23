import {
  NotFoundError,
  ValidationError,
  type IdentityId,
  type ProjectId,
  type TenantId,
  type Sprint,
  type SprintId,
  type WorkItem,
  type WorkItemId,
  type WorkItemReferences,
  type Edition,
} from '@dsh-scrum/scrum-domain'
import {
  archiveProject,
  bindWorkspace,
  createProject,
  blockWorkItem,
  closeSprint,
  configureProject,
  createSprint,
  createWorkItem,
  deleteWorkItem,
  getSprint,
  getWorkItem,
  listSprints,
  listWorkItems,
  moveWorkItemStatus,
  resolveWorkItem,
  moveWorkItemToRank,
  planSprint,
  readSprintReport,
  recentActivity,
  startSprint,
  updateWorkItem,
  updateProjectDetails,
  resolveProjectAuthorization,
  restoreProject,
  setAcceptanceCriterion,
  setWorkItemDependency,
  setWorkItemParent,
  unbindWorkspace,
  type ProjectAuthorization,
  type BlockWorkItemCommand,
  type CloseSprintCommand,
  type ConfigureProjectCommand,
  type CreateSprintCommand,
  type CreateWorkItemCommand,
  type DeleteWorkItemCommand,
  type MoveWorkItemRankCommand,
  type MoveWorkItemStatusCommand,
  type ResolveWorkItemCommand,
  type PlanSprintCommand,
  type SetAcceptanceCriterionCommand,
  type SetWorkItemParentCommand,
  type SprintReport,
  type StartSprintCommand,
  type UpdateWorkItemCommand,
  type UpdateProjectDetailsCommand,
  type WorkItemDependencyCommand,
  type WorkItemFilter,
  type ActorContext,
  type ActivityHistory,
  type ActivitySource,
  type ActivityWindow,
  type ApplicationDependencies,
  type CreateProjectCommand,
  type StoredProject,
  type WorkspaceBinding,
} from '@dsh-scrum/scrum-application'
import type { RemoteConnectionOffer, RemoteConnectionProfile } from '@dsh-scrum/scrum-api-contract'
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
  /**
   * Who the call runs as, in the workspace it runs against.
   *
   * The workspace is a parameter because an edition without a sign-in has to
   * find the answer in the data — a workspace holding a project records who
   * created it — and there is no one identity that spans workspaces to hand
   * back instead.
   */
  identity(workspace: HarnessWorkspace): Promise<IdentityId>
  /**
   * Which tenant a project created here belongs to.
   *
   * Asked of the edition rather than taken from the caller: Community mints a
   * personal tenant per workspace and a connected service supplies the
   * authenticated one, and neither is something a browser should be able to
   * name. A client that could pass a tenant could create a project inside
   * somebody else's.
   */
  tenant(workspace: HarnessWorkspace): Promise<TenantId>
  /**
   * The application ports bound to one workspace. Called per request rather
   * than once, so a workspace that is closed and reopened does not keep
   * writing through handles to a directory that has moved.
   */
  forWorkspace(workspace: HarnessWorkspace): Promise<ApplicationDependencies>
}

/** Non-secret description of where one workspace's Scrum data lives. */
export type WorkspaceRuntimeTarget =
  | { readonly kind: 'local' }
  | {
      readonly kind: 'remote'
      readonly connectionId: string
      readonly projectId: string
    }

/** The target and runtime selected for one workspace request. */
export interface ResolvedWorkspaceRuntime {
  readonly target: WorkspaceRuntimeTarget
  readonly runtime: ScrumRuntime
  readonly context: WorkspaceRuntimeContext
}

/** Display-only service context; capabilities remain the source of behaviour. */
export interface WorkspaceRuntimeContext {
  readonly edition: Edition
  readonly serviceName: string
  readonly tenantName: string
}

/** Selects a runtime from the workspace that Harness says is current. */
export interface WorkspaceRuntimeResolver {
  resolve(workspace: HarnessWorkspace): Promise<ResolvedWorkspaceRuntime>
}

/** Compatibility source for local-only compositions and workspace routers. */
export type ScrumRuntimeSource = ScrumRuntime | WorkspaceRuntimeResolver

export function localRuntimeTarget(): WorkspaceRuntimeTarget {
  return { kind: 'local' }
}

export function remoteRuntimeTarget(
  connectionId: string,
  projectId: string,
): WorkspaceRuntimeTarget {
  if (connectionId.trim() === '' || projectId.trim() === '') {
    throw new ValidationError('a remote workspace target requires connection and project ids', {
      connectionId,
      projectId,
    })
  }
  return { kind: 'remote', connectionId, projectId }
}

/** Wraps a single runtime as the zero-configuration local resolver. */
export function fixedRuntimeResolver(
  runtime: ScrumRuntime,
  target: WorkspaceRuntimeTarget = localRuntimeTarget(),
  context: WorkspaceRuntimeContext = {
    edition: 'community',
    serviceName: 'Local',
    tenantName: 'Personal',
  },
): WorkspaceRuntimeResolver {
  return { resolve: () => Promise.resolve({ target, runtime, context }) }
}

async function runtimeFor(
  source: ScrumRuntimeSource,
  workspace: HarnessWorkspace,
): Promise<ResolvedWorkspaceRuntime> {
  return 'resolve' in source
    ? await source.resolve(workspace)
    : await fixedRuntimeResolver(source).resolve(workspace)
}

/** Everything the host resolved before running one call. */
export interface HostRequestContext {
  readonly target: WorkspaceRuntimeTarget
  readonly runtime: ScrumRuntime
  readonly deps: ApplicationDependencies
  readonly actor: ActorContext
  readonly workspace: HarnessWorkspace
  readonly session: HarnessSession | null
}

/**
 * Creating the project and attaching the workspace is one act, so one command.
 * The tenant is absent: the edition supplies it, for the reason `ScrumRuntime`
 * gives.
 */
export type InitialiseWorkspaceCommand = Omit<CreateProjectCommand, 'tenantId'>

export interface ScrumHostApi {
  readonly version: number
  entry(): Promise<EntryState>
  remoteProfiles(): Promise<readonly RemoteConnectionProfile[]>
  beginRemote(connectionId: string): Promise<RemoteConnectionOffer>
  attachRemote(connectionId: string, projectId: string): Promise<void>
  /** Creates a project and attaches this workspace to it, which is one act. */
  initialise(command: InitialiseWorkspaceCommand): Promise<StoredProject>
  updateProject(command: WorkOf<UpdateProjectDetailsCommand>): Promise<StoredProject>
  attach(projectId: ProjectId): Promise<WorkspaceBinding>
  detach(): Promise<WorkspaceBinding | null>
  archive(): Promise<StoredProject>
  restore(): Promise<StoredProject>
  /** What the current user may do in the bound project, independent of a conversation. */
  authorization(): Promise<ProjectAuthorization>
  backlog(filter?: WorkItemFilter): Promise<readonly WorkItem[]>
  workItem(id: WorkItemId): Promise<WorkItem>
  sprints(): Promise<readonly Sprint[]>
  sprint(id: SprintId): Promise<Sprint>
  /** A sprint's progress beside what it committed to when it opened. */
  report(id: SprintId): Promise<SprintReport>
  /** The most recent changes to the bound project, newest first. */
  activity(window: ActivityWindow): Promise<ActivityHistory>
  createWorkItem(command: WorkOf<CreateWorkItemCommand>): Promise<WorkItem>
  updateWorkItem(command: WorkOf<UpdateWorkItemCommand>): Promise<WorkItem>
  moveWorkItemToRank(command: WorkOf<MoveWorkItemRankCommand>): Promise<WorkItem>
  moveWorkItemStatus(command: WorkOf<MoveWorkItemStatusCommand>): Promise<WorkItem>
  resolveWorkItem(command: WorkOf<ResolveWorkItemCommand>): Promise<WorkItem>
  blockWorkItem(command: WorkOf<BlockWorkItemCommand>): Promise<WorkItem>
  /**
   * The three edits the detail panel makes that `updateWorkItem` deliberately
   * cannot. `WorkItemDetailChanges` leaves out parent, dependencies and
   * acceptance state because each carries a rule of its own — a parent that
   * cannot form a cycle, a dependency that must resolve inside the project,
   * and a criterion governed by who may declare work accepted rather than by
   * who may describe it. Routing them through the detail editor would route
   * them past those rules.
   */
  setWorkItemParent(command: WorkOf<SetWorkItemParentCommand>): Promise<WorkItem>
  setWorkItemDependency(command: WorkOf<WorkItemDependencyCommand>): Promise<WorkItem>
  setAcceptanceCriterion(command: WorkOf<SetAcceptanceCriterionCommand>): Promise<WorkItem>
  deleteWorkItem(command: WorkOf<DeleteWorkItemCommand>): Promise<WorkItemReferences>
  planSprint(command: WorkOf<PlanSprintCommand>): Promise<readonly WorkItem[]>
  createSprint(command: WorkOf<CreateSprintCommand>): Promise<Sprint>
  startSprint(command: WorkOf<StartSprintCommand>): Promise<Sprint>
  closeSprint(command: WorkOf<CloseSprintCommand>): Promise<Sprint>
  configureProject(command: WorkOf<ConfigureProjectCommand>): Promise<StoredProject>
}

export interface RemoteConnectorPort {
  profiles(): Promise<readonly RemoteConnectionProfile[]>
  begin(connectionId: string): Promise<RemoteConnectionOffer>
  attach(workspaceRoot: string, connectionId: string, projectId: string): Promise<unknown>
}

/**
 * A use case command without its project.
 *
 * The project is the one the workspace is bound to, resolved by the host on
 * every call. Letting a caller name it would make the binding advisory: a
 * client or a tool could reach a project this workspace was never attached to
 * by passing a different identifier.
 */
export type WorkOf<Command extends { readonly projectId: ProjectId }> = Omit<Command, 'projectId'>

/**
 * Resolves the workspace, the session and the stores for one call.
 *
 * Everything comes from the Harness context, never from the filesystem: the
 * host must not work out which workspace is open by looking around, because
 * the answer would be a guess that can disagree with what the user sees.
 */
export async function resolveRequest(
  harness: HarnessContext,
  source: ScrumRuntimeSource,
  activitySource?: ActivitySource,
): Promise<HostRequestContext> {
  const workspace = await harness.currentWorkspace()
  if (workspace === null) {
    throw new ValidationError('no workspace is selected', {})
  }
  const session = await currentSessionOf(harness, workspace)
  const resolved = await runtimeFor(source, workspace)
  return {
    target: resolved.target,
    runtime: resolved.runtime,
    deps: await resolved.runtime.forWorkspace(workspace),
    actor: hostActor(await resolved.runtime.identity(workspace), session, activitySource),
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

export function createHostApi(
  harness: HarnessContext,
  source: ScrumRuntimeSource,
  remote?: RemoteConnectorPort,
  activitySource?: ActivitySource,
): ScrumHostApi {
  async function boundProjectId(request: HostRequestContext): Promise<ProjectId> {
    return (await requireBoundProject(request, harness)).project.project.id
  }

  function connector(): RemoteConnectorPort {
    if (remote === undefined) {
      throw new ValidationError('no remote Scrum connection is configured', {})
    }
    return remote
  }

  async function remoteCall<Result>(run: () => Promise<Result>): Promise<Result> {
    try {
      return await run()
    } catch (error: unknown) {
      const kind =
        typeof error === 'object' &&
        error !== null &&
        'kind' in error &&
        ['authentication', 'compatibility', 'network', 'authorization'].includes(String(error.kind))
          ? String(error.kind)
          : 'network'
      throw new ValidationError(`remote Scrum ${kind} failure`, { remoteFailure: kind })
    }
  }

  return {
    version: HOST_API_VERSION,

    async entry(): Promise<EntryState> {
      const workspace = await harness.currentWorkspace()
      if (workspace === null) {
        return { state: 'no-workspace' }
      }
      const resolved = await runtimeFor(source, workspace)
      const deps = await resolved.runtime.forWorkspace(workspace)
      const actor = hostActor(
        await resolved.runtime.identity(workspace),
        await currentSessionOf(harness, workspace),
        activitySource,
      )
      return {
        ...(await describeEntry(deps, harness, actor, workspace)),
        runtimeContext: resolved.context,
      }
    },

    remoteProfiles: async () => await remoteCall(async () => await connector().profiles()),

    beginRemote: async (connectionId) =>
      await remoteCall(async () => await connector().begin(connectionId)),

    attachRemote: async (connectionId, projectId) => {
      const workspace = await harness.currentWorkspace()
      if (workspace === null) throw new ValidationError('no workspace is selected', {})
      await remoteCall(
        async () => await connector().attach(workspace.path, connectionId, projectId),
      )
    },

    async initialise(command: InitialiseWorkspaceCommand): Promise<StoredProject> {
      const request = await resolveRequest(harness, source, activitySource)
      const stored = await createProject(request.deps, {
        actor: request.actor,
        command: { ...command, tenantId: await request.runtime.tenant(request.workspace) },
      })
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

    async updateProject(command: WorkOf<UpdateProjectDetailsCommand>): Promise<StoredProject> {
      const request = await resolveRequest(harness, source, activitySource)
      return await updateProjectDetails(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async attach(projectId: ProjectId): Promise<WorkspaceBinding> {
      const request = await resolveRequest(harness, source, activitySource)
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
      const request = await resolveRequest(harness, source, activitySource)
      return await unbindWorkspace(request.deps, {
        actor: request.actor,
        command: { workspace: workspaceRefOf(harness, request.workspace) },
      })
    },

    async authorization(): Promise<ProjectAuthorization> {
      const request = await resolveRequest(harness, source, activitySource)
      return await resolveProjectAuthorization(request.deps, {
        actor: request.actor,
        command: { projectId: await boundProjectId(request) },
      })
    },

    async backlog(filter: WorkItemFilter = {}): Promise<readonly WorkItem[]> {
      const request = await resolveRequest(harness, source, activitySource)
      return await listWorkItems(request.deps, {
        actor: request.actor,
        command: { projectId: await boundProjectId(request), filter },
      })
    },

    async workItem(id: WorkItemId): Promise<WorkItem> {
      const request = await resolveRequest(harness, source, activitySource)
      return await getWorkItem(request.deps, {
        actor: request.actor,
        command: { projectId: await boundProjectId(request), workItemId: id },
      })
    },

    async sprints(): Promise<readonly Sprint[]> {
      const request = await resolveRequest(harness, source, activitySource)
      return await listSprints(request.deps, {
        actor: request.actor,
        command: { projectId: await boundProjectId(request) },
      })
    },

    async sprint(id: SprintId): Promise<Sprint> {
      const request = await resolveRequest(harness, source, activitySource)
      return await getSprint(request.deps, {
        actor: request.actor,
        command: { projectId: await boundProjectId(request), sprintId: id },
      })
    },

    async report(id: SprintId): Promise<SprintReport> {
      const request = await resolveRequest(harness, source, activitySource)
      return await readSprintReport(request.deps, {
        actor: request.actor,
        command: { projectId: await boundProjectId(request), sprintId: id },
      })
    },

    async activity(window: ActivityWindow): Promise<ActivityHistory> {
      const request = await resolveRequest(harness, source, activitySource)
      return await recentActivity(request.deps, {
        actor: request.actor,
        command: { ...window, projectId: await boundProjectId(request) },
      })
    },

    async createWorkItem(command: WorkOf<CreateWorkItemCommand>): Promise<WorkItem> {
      const request = await resolveRequest(harness, source, activitySource)
      return await createWorkItem(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async updateWorkItem(command: WorkOf<UpdateWorkItemCommand>): Promise<WorkItem> {
      const request = await resolveRequest(harness, source, activitySource)
      return await updateWorkItem(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async moveWorkItemToRank(command: WorkOf<MoveWorkItemRankCommand>): Promise<WorkItem> {
      const request = await resolveRequest(harness, source, activitySource)
      return await moveWorkItemToRank(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async moveWorkItemStatus(command: WorkOf<MoveWorkItemStatusCommand>): Promise<WorkItem> {
      const request = await resolveRequest(harness, source, activitySource)
      return await moveWorkItemStatus(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async resolveWorkItem(command: WorkOf<ResolveWorkItemCommand>): Promise<WorkItem> {
      const request = await resolveRequest(harness, source, activitySource)
      return await resolveWorkItem(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async blockWorkItem(command: WorkOf<BlockWorkItemCommand>): Promise<WorkItem> {
      const request = await resolveRequest(harness, source, activitySource)
      return await blockWorkItem(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async setWorkItemParent(command: WorkOf<SetWorkItemParentCommand>): Promise<WorkItem> {
      const request = await resolveRequest(harness, source, activitySource)
      return await setWorkItemParent(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async setWorkItemDependency(command: WorkOf<WorkItemDependencyCommand>): Promise<WorkItem> {
      const request = await resolveRequest(harness, source, activitySource)
      return await setWorkItemDependency(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async setAcceptanceCriterion(
      command: WorkOf<SetAcceptanceCriterionCommand>,
    ): Promise<WorkItem> {
      const request = await resolveRequest(harness, source, activitySource)
      return await setAcceptanceCriterion(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async deleteWorkItem(command: WorkOf<DeleteWorkItemCommand>): Promise<WorkItemReferences> {
      const request = await resolveRequest(harness, source, activitySource)
      return await deleteWorkItem(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async planSprint(command: WorkOf<PlanSprintCommand>): Promise<readonly WorkItem[]> {
      const request = await resolveRequest(harness, source, activitySource)
      return await planSprint(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async createSprint(command: WorkOf<CreateSprintCommand>): Promise<Sprint> {
      const request = await resolveRequest(harness, source, activitySource)
      return await createSprint(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async startSprint(command: WorkOf<StartSprintCommand>): Promise<Sprint> {
      const request = await resolveRequest(harness, source, activitySource)
      return await startSprint(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async closeSprint(command: WorkOf<CloseSprintCommand>): Promise<Sprint> {
      const request = await resolveRequest(harness, source, activitySource)
      return await closeSprint(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async configureProject(command: WorkOf<ConfigureProjectCommand>): Promise<StoredProject> {
      const request = await resolveRequest(harness, source, activitySource)
      return await configureProject(request.deps, {
        actor: request.actor,
        command: { ...command, projectId: await boundProjectId(request) },
      })
    },

    async archive(): Promise<StoredProject> {
      const request = await resolveRequest(harness, source, activitySource)
      return await archiveProject(request.deps, {
        actor: request.actor,
        command: { projectId: await boundProjectId(request) },
      })
    },

    async restore(): Promise<StoredProject> {
      const request = await resolveRequest(harness, source, activitySource)
      return await restoreProject(request.deps, {
        actor: request.actor,
        command: { projectId: await boundProjectId(request) },
      })
    },
  }
}
