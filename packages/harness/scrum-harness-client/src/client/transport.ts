import {
  SCRUM_CHANNEL,
  SCRUM_ENDPOINT,
  createRequest,
  isErrorResponse,
  parseResponse,
  payloadSchema,
  type ApiResponse,
  type EntryPayload,
  type RemoteConnectionOffer,
  type RemoteConnectionProfile,
  type ProjectPayload,
  type ScrumEndpoint,
  type ScrumScope,
  type AuthorizationPayload,
} from '@dsh-scrum/scrum-api-contract'
import type { Sprint, WorkItem } from '@dsh-scrum/scrum-domain'
import type {
  ActivityQuery,
  ActivityView,
  BacklogQuery,
  BlockWorkItem,
  CloseSprint,
  CreateProjectInput,
  DependWorkItem,
  EditWorkItem,
  EntryView,
  MoveWorkItemStatus,
  ResolveWorkItem,
  NewSprint,
  NewWorkItem,
  ParentWorkItem,
  PlanSprint,
  ProjectView,
  RankWorkItem,
  ScrumClient,
  UpdateProjectInput,
  SetCriterion,
  SprintRef,
  AuthorizationView,
} from '@dsh-scrum/scrum-ui'

/**
 * The transport, as this package needs it.
 *
 * Structural rather than the Harness type, for two reasons. The shell types
 * `ctx.connection` for its node half, and the browser half publishes no
 * augmentation of its own, so the concrete type is not reachable from here
 * anyway. And a transport this narrow can be satisfied by a test in one line,
 * which is what keeps every screen state drivable without a shell.
 */
export type RpcCall = (channel: string, endpoint: string, payload: unknown) => Promise<RpcOutcome>

/** The transport's own result: its failure branch, never a business one. */
export type RpcOutcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

/**
 * A failure carried back from the host.
 *
 * It is thrown with its code intact because the interface reads failures
 * structurally — a conflict is the one failure with a next step the user can
 * take, and a conflict that arrived as a plain `Error` would be shown as an
 * unknown problem in exactly the case where telling the user to refresh
 * matters.
 */
export class ScrumCallError extends Error {
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ScrumCallError'
    this.code = code
    this.details = details
  }
}

/** Which workspace and session the window is showing, read at call time. */
export type ScopeReader = () => ScrumScope

/**
 * The client interface over one channel.
 *
 * Every call is one round trip and nothing is cached. The host resolves the
 * binding, the current permissions and the project state on each call, and a client
 * that remembered an answer would be a second place those decisions live —
 * one that keeps showing write controls after the mode was lowered.
 */
export function createTransportClient(call: RpcCall, scope: ScopeReader): ScrumClient {
  async function send<Payload>(endpoint: ScrumEndpoint, input: unknown): Promise<Payload> {
    const outcome = await call(
      SCRUM_CHANNEL,
      endpoint,
      createRequest({ scope: scope(), input }).data,
    )
    if (!outcome.ok) {
      // The transport failed rather than the call: nothing reached the host,
      // or nothing came back. It carries the shell's own code, which is not a
      // Scrum code, so it is reported as what it is.
      throw new ScrumCallError('INTERNAL', outcome.error.message, { transport: outcome.error.code })
    }
    return unwrap(parseResponse(payloadSchema<Payload>(), outcome.value))
  }

  function unwrap<Payload>(response: ApiResponse<Payload>): Payload {
    if (isErrorResponse(response)) {
      throw new ScrumCallError(response.error.code, response.error.message, response.error.details)
    }
    return response.data
  }

  return {
    authorization: async () =>
      toAuthorizationView(await send<AuthorizationPayload>(SCRUM_ENDPOINT.authorization, {})),
    entry: async () => toEntryView(await send<EntryPayload>(SCRUM_ENDPOINT.entry, {})),
    remoteProfiles: async () =>
      await send<readonly RemoteConnectionProfile[]>(SCRUM_ENDPOINT.remoteProfiles, {}),
    beginRemote: async (connectionId) =>
      await send<RemoteConnectionOffer>(SCRUM_ENDPOINT.remoteBegin, { connectionId }),
    attachRemote: async (connectionId, projectId) => {
      await send<void>(SCRUM_ENDPOINT.remoteAttach, { connectionId, projectId })
    },
    createProject: async (input: CreateProjectInput) =>
      toProjectView(await send<ProjectPayload>(SCRUM_ENDPOINT.createProject, input)),
    updateProject: async (input: UpdateProjectInput) =>
      toProjectView(await send<ProjectPayload>(SCRUM_ENDPOINT.updateProject, input)),
    backlog: async (query?: BacklogQuery) =>
      await send<readonly WorkItem[]>(SCRUM_ENDPOINT.backlog, query ?? {}),
    createWorkItem: async (input: NewWorkItem) =>
      await send<WorkItem>(SCRUM_ENDPOINT.createWorkItem, input),
    updateWorkItem: async (command: EditWorkItem) =>
      await send<WorkItem>(SCRUM_ENDPOINT.updateWorkItem, command),
    setAcceptanceCriterion: async (command: SetCriterion) =>
      await send<WorkItem>(SCRUM_ENDPOINT.setAcceptanceCriterion, command),
    moveWorkItemToRank: async (command: RankWorkItem) =>
      await send<WorkItem>(SCRUM_ENDPOINT.moveWorkItemToRank, command),
    setWorkItemParent: async (command: ParentWorkItem) =>
      await send<WorkItem>(SCRUM_ENDPOINT.setWorkItemParent, command),
    setWorkItemDependency: async (command: DependWorkItem) =>
      await send<WorkItem>(SCRUM_ENDPOINT.setWorkItemDependency, command),
    blockWorkItem: async (command: BlockWorkItem) =>
      await send<WorkItem>(SCRUM_ENDPOINT.blockWorkItem, command),
    moveWorkItemStatus: async (command: MoveWorkItemStatus) =>
      await send<WorkItem>(SCRUM_ENDPOINT.moveWorkItemStatus, command),
    resolveWorkItem: async (command: ResolveWorkItem) =>
      await send<WorkItem>(SCRUM_ENDPOINT.resolveWorkItem, command),
    sprints: async () => await send<readonly Sprint[]>(SCRUM_ENDPOINT.sprints, {}),
    createSprint: async (input: NewSprint) =>
      await send<Sprint>(SCRUM_ENDPOINT.createSprint, input),
    planSprint: async (command: PlanSprint) =>
      await send<readonly WorkItem[]>(SCRUM_ENDPOINT.planSprint, command),
    startSprint: async (command: SprintRef) =>
      await send<Sprint>(SCRUM_ENDPOINT.startSprint, command),
    closeSprint: async (command: CloseSprint) =>
      await send<Sprint>(SCRUM_ENDPOINT.closeSprint, command),
    activity: async (query: ActivityQuery) =>
      await send<ActivityView>(SCRUM_ENDPOINT.activity, query),
  }
}

/**
 * The wire's shapes as the screens' shapes.
 *
 * Thin today, and deliberately still a step. The two are declared apart — one
 * is what any client of this contract receives, the other is what this
 * interface chose to render — and the day one gains a field the other does not
 * want, the projection is already the place that decides.
 */
function toProjectView(payload: ProjectPayload): ProjectView {
  return payload
}

function toAuthorizationView(payload: AuthorizationPayload): AuthorizationView {
  return payload
}

function toEntryView(payload: EntryPayload): EntryView {
  const runtime =
    payload.runtimeContext === undefined ? {} : { runtimeContext: payload.runtimeContext }
  switch (payload.state) {
    case 'no-workspace':
      return { state: 'no-workspace', ...runtime }
    case 'unbound':
      return { state: 'unbound', workspace: payload.workspace, ...runtime }
    case 'stale':
      return { state: 'stale', workspace: payload.workspace, ...runtime }
    case 'bound':
    case 'archived':
      return {
        state: payload.state,
        workspace: payload.workspace,
        project: payload.project,
        moved: payload.moved,
        ...runtime,
      }
  }
}
