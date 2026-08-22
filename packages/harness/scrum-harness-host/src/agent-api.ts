import {
  ForbiddenError,
  PERMISSION,
  type Permission,
  type Sprint,
  type SprintId,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import {
  resolveSessionAuthorization,
  type SprintProgress,
  type StoredProject,
  type WorkItemFilter,
} from '@dsh-scrum/scrum-application'
import { requireBoundProject, resolveRequest, type ScrumRuntime, type ScrumHostApi } from './api.js'
import type { HarnessContext } from './workspace.js'

/**
 * The host API as one agent session sees it.
 *
 * A second narrowing rather than a second enforcement path: the use cases
 * still ask whether the actor's roles allow the action, and this asks whether
 * the session was given that much reach. They answer different questions and
 * both have to hold, so neither can be dropped in favour of the other.
 *
 * The session is resolved on every call. An agent that was granted write
 * access and then had it lowered mid-conversation loses it on its next tool
 * call, not when something remembers to refresh.
 */
export interface ScrumAgentApi {
  readonly version: number
  project(): Promise<StoredProject>
  backlog(filter?: WorkItemFilter): Promise<readonly WorkItem[]>
  workItem(id: WorkItemId): Promise<WorkItem>
  sprints(): Promise<readonly Sprint[]>
  sprint(id: SprintId): Promise<Sprint>
  progress(id: SprintId): Promise<SprintProgress>
}

export function createAgentApi(
  harness: HarnessContext,
  runtime: ScrumRuntime,
  api: ScrumHostApi,
  sessionId: string,
): ScrumAgentApi {
  /**
   * Refuses before the call reaches a use case.
   *
   * Refusing here rather than inside the tool keeps the reason attributable:
   * a tool that checked for itself would be a second place the session rule
   * lives, and the two would eventually disagree.
   */
  async function assertSessionAllows(permission: Permission): Promise<void> {
    const request = await resolveRequest(harness, runtime)
    const { project } = await requireBoundProject(request, harness)
    const authorization = await resolveSessionAuthorization(request.deps, {
      actor: request.actor,
      command: {
        harnessInstanceId: harness.instanceId,
        sessionId,
        projectId: project.project.id,
      },
    })
    if (!authorization.permissions.has(permission)) {
      throw new ForbiddenError(`this session may not ${permission}`, {
        permission,
        sessionId,
        accessMode: authorization.mode,
      })
    }
  }

  async function reading<Result>(
    permission: Permission,
    run: () => Promise<Result>,
  ): Promise<Result> {
    await assertSessionAllows(permission)
    return await run()
  }

  return {
    version: api.version,
    project: async () =>
      await reading(PERMISSION.projectView, async () => {
        const entry = await api.entry()
        if (entry.state !== 'bound' && entry.state !== 'archived') {
          throw new ForbiddenError('this workspace has no project to read', { sessionId })
        }
        return { project: entry.project, config: entry.config }
      }),
    backlog: async (filter?: WorkItemFilter) =>
      await reading(PERMISSION.backlogView, async () => await api.backlog(filter)),
    workItem: async (id: WorkItemId) =>
      await reading(PERMISSION.backlogView, async () => await api.workItem(id)),
    sprints: async () => await reading(PERMISSION.projectView, async () => await api.sprints()),
    sprint: async (id: SprintId) =>
      await reading(PERMISSION.projectView, async () => await api.sprint(id)),
    progress: async (id: SprintId) =>
      await reading(PERMISSION.reportView, async () => await api.progress(id)),
  }
}
