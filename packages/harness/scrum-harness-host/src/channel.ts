import {
  SCRUM_ENDPOINT,
  SCRUM_INPUT,
  errorResponse,
  isScrumEndpoint,
  scrumCallSchema,
  successResponse,
  toValidationError,
  type ApiResponse,
  type EntryPayload,
  type ProjectPayload,
  type ScrumEndpoint,
  type ScrumInput,
  type ScrumScope,
  type SessionPayload,
  type WorkspacePayload,
} from '@dsh-scrum/scrum-api-contract'
import { ValidationError, type Project } from '@dsh-scrum/scrum-domain'
import type { SessionAuthorization, StoredProject } from '@dsh-scrum/scrum-application'
import type { ScrumHostApi } from './api.js'
import type { EntryState } from './entry.js'
import type { HarnessWorkspace } from './workspace.js'

/**
 * The API for one call's scope.
 *
 * Supplied rather than held, because the scope changes with every call: the
 * host serves every session at once, and an API bound to one workspace at
 * registration time would answer for whichever one happened to be open when
 * the channel was registered.
 */
export type ApiForScope = (scope: ScrumScope) => ScrumHostApi

/**
 * The transport's own result shape.
 *
 * Written structurally rather than imported: the Harness error codes are a
 * closed union owned by the shell, with no room for a revision conflict or a
 * permission refusal. Those travel inside the payload's own envelope, on the
 * success branch, and this branch is left for the transport's own failures —
 * which, on a channel whose handler catches everything, means none.
 */
export interface ChannelResult {
  readonly ok: true
  readonly value: unknown
}

/** A decoded endpoint call, as the Harness channel registry delivers it. */
export type ChannelHandler = (endpoint: string, payload: unknown) => Promise<ChannelResult>

/**
 * The channel's dispatcher.
 *
 * Everything is answered on the success branch of the transport carrying an
 * API envelope, including failures. A domain error has a code, a message and
 * details the interface knows how to render, and folding it into the
 * transport's `internal` would throw all three away at the one boundary that
 * has to preserve them.
 */
export function createChannelHandler(apiFor: ApiForScope): ChannelHandler {
  return async (endpoint, payload) => {
    return { ok: true, value: await answer(apiFor, endpoint, payload) }
  }
}

async function answer(
  apiFor: ApiForScope,
  endpoint: string,
  payload: unknown,
): Promise<ApiResponse<unknown>> {
  try {
    if (!isScrumEndpoint(endpoint)) {
      throw new ValidationError('unknown Scrum endpoint', { endpoint })
    }
    const call = scrumCallSchema.parse(payload)
    const dispatchable = { endpoint, input: parse(endpoint, call.input) } as Dispatchable
    return successResponse(await dispatch(apiFor(call.scope), dispatchable))
  } catch (error) {
    return errorResponse(error)
  }
}

/** The endpoint's own schema, run after the shell so a bad scope reads as one. */
function parse<Endpoint extends ScrumEndpoint>(
  endpoint: Endpoint,
  input: unknown,
): ScrumInput<Endpoint> {
  const result = SCRUM_INPUT[endpoint].safeParse(input)
  if (!result.success) {
    throw toValidationError(result.error, `payload for ${endpoint} is invalid`)
  }
  return result.data as ScrumInput<Endpoint>
}

/**
 * One call, with its endpoint and its parsed payload travelling together.
 *
 * A discriminated union rather than two arguments: the endpoint is what says
 * which payload shape arrived, and splitting them would leave the payload
 * typed as whatever every endpoint has in common, which is nothing.
 */
type Dispatchable = {
  [Endpoint in ScrumEndpoint]: { endpoint: Endpoint; input: ScrumInput<Endpoint> }
}[ScrumEndpoint]

/**
 * One endpoint onto one API call.
 *
 * Exhaustive over the endpoint union with no default branch, so an endpoint
 * added to the contract without a case here does not compile. The alternative
 * — a lookup table of loosely typed functions — would accept the addition and
 * fail at the first call.
 */
async function dispatch(api: ScrumHostApi, call: Dispatchable): Promise<unknown> {
  switch (call.endpoint) {
    case SCRUM_ENDPOINT.session:
      return toSessionPayload(await api.session(), await isArchived(api))
    case SCRUM_ENDPOINT.setSessionAccess:
      await api.setSessionAccess(call.input.mode)
      return toSessionPayload(await api.session(), await isArchived(api))
    case SCRUM_ENDPOINT.entry:
      return toEntryPayload(await api.entry())
    case SCRUM_ENDPOINT.createProject:
      return toProjectPayload(await api.initialise(call.input))
    case SCRUM_ENDPOINT.backlog:
      return api.backlog(call.input)
    case SCRUM_ENDPOINT.createWorkItem:
      return api.createWorkItem(call.input)
    case SCRUM_ENDPOINT.updateWorkItem:
      return api.updateWorkItem(call.input)
    case SCRUM_ENDPOINT.setAcceptanceCriterion:
      return api.setAcceptanceCriterion(call.input)
    case SCRUM_ENDPOINT.moveWorkItemToRank:
      return api.moveWorkItemToRank(call.input)
    case SCRUM_ENDPOINT.setWorkItemParent:
      return api.setWorkItemParent(call.input)
    case SCRUM_ENDPOINT.setWorkItemDependency:
      return api.setWorkItemDependency(call.input)
    case SCRUM_ENDPOINT.blockWorkItem:
      return api.blockWorkItem(call.input)
    case SCRUM_ENDPOINT.moveWorkItemStatus:
      return api.moveWorkItemStatus(call.input)
    case SCRUM_ENDPOINT.sprints:
      return api.sprints()
    case SCRUM_ENDPOINT.createSprint:
      return api.createSprint(call.input)
    case SCRUM_ENDPOINT.planSprint:
      return api.planSprint(call.input)
    case SCRUM_ENDPOINT.startSprint:
      return api.startSprint(call.input)
    case SCRUM_ENDPOINT.closeSprint:
      return api.closeSprint(call.input)
  }
}

/** Whether the project is archived, which the session answer has to carry. */
async function isArchived(api: ScrumHostApi): Promise<boolean> {
  return (await api.entry()).state === 'archived'
}

function toWorkspacePayload(workspace: HarnessWorkspace): WorkspacePayload {
  // The path is deliberately dropped rather than forwarded: the interface
  // shows a name, and the wire should not carry a directory layout it has no
  // use for.
  return { id: workspace.id, name: workspace.name }
}

function toProjectPayload(stored: StoredProject | Project): ProjectPayload {
  const project = 'project' in stored ? stored.project : stored
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
  }
}

function toEntryPayload(entry: EntryState): EntryPayload {
  switch (entry.state) {
    case 'no-workspace':
      return { state: 'no-workspace' }
    case 'unbound':
      return { state: 'unbound', workspace: toWorkspacePayload(entry.workspace) }
    case 'stale':
      return { state: 'stale', workspace: toWorkspacePayload(entry.workspace) }
    case 'bound':
    case 'archived':
      return {
        state: entry.state,
        workspace: toWorkspacePayload(entry.workspace),
        project: toProjectPayload(entry.project),
        moved: entry.moved,
      }
  }
}

function toSessionPayload(
  authorization: SessionAuthorization,
  projectArchived: boolean,
): SessionPayload {
  // Sets do not survive JSON, and the difference between the two lists is the
  // whole explanation of a degraded mode, so both are spelled out as arrays.
  return {
    mode: authorization.mode,
    granted: [...authorization.granted],
    permissions: [...authorization.permissions],
    projectArchived,
  }
}
