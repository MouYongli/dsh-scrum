import {
  ForbiddenError,
  PERMISSION,
  type Permission,
  type Sprint,
  type SprintId,
  type WorkItem,
  type WorkItemId,
  type WorkItemReferences,
} from '@dsh-scrum/scrum-domain'
import {
  resolveProjectAuthorization,
  type SprintProgress,
  type StoredProject,
  type WorkItemFilter,
} from '@dsh-scrum/scrum-application'
import {
  requireBoundProject,
  resolveRequest,
  type ScrumRuntimeSource,
  type ScrumHostApi,
} from './api.js'
import type { HarnessContext } from './workspace.js'

/**
 * The host API as an agent in one workspace sees it.
 *
 * Tool calls resolve the current user's effective project permissions on
 * every call. The Session remains available to Activity as provenance but
 * does not grant or narrow access.
 */
export interface ScrumAgentApi {
  readonly version: number
  project(): Promise<StoredProject>
  backlog(filter?: WorkItemFilter): Promise<readonly WorkItem[]>
  workItem(id: WorkItemId): Promise<WorkItem>
  sprints(): Promise<readonly Sprint[]>
  sprint(id: SprintId): Promise<Sprint>
  progress(id: SprintId): Promise<SprintProgress>
  createWorkItem(command: AgentCommand<'createWorkItem'>): Promise<WorkItem>
  updateWorkItem(command: AgentCommand<'updateWorkItem'>): Promise<WorkItem>
  moveWorkItemToRank(command: AgentCommand<'moveWorkItemToRank'>): Promise<WorkItem>
  moveWorkItemStatus(command: AgentCommand<'moveWorkItemStatus'>): Promise<WorkItem>
  blockWorkItem(command: AgentCommand<'blockWorkItem'>): Promise<WorkItem>
  setWorkItemParent(command: AgentCommand<'setWorkItemParent'>): Promise<WorkItem>
  setWorkItemDependency(command: AgentCommand<'setWorkItemDependency'>): Promise<WorkItem>
  setAcceptanceCriterion(command: AgentCommand<'setAcceptanceCriterion'>): Promise<WorkItem>
  deleteWorkItem(command: AgentCommand<'deleteWorkItem'>): Promise<WorkItemReferences>
  planSprint(command: AgentCommand<'planSprint'>): Promise<readonly WorkItem[]>
  createSprint(command: AgentCommand<'createSprint'>): Promise<Sprint>
  startSprint(command: AgentCommand<'startSprint'>): Promise<Sprint>
  closeSprint(command: AgentCommand<'closeSprint'>): Promise<Sprint>
  configureProject(command: AgentCommand<'configureProject'>): Promise<StoredProject>
}

/** The command one host call takes, so the two surfaces cannot drift apart. */
type AgentCommand<Name extends keyof ScrumHostApi> = ScrumHostApi[Name] extends (
  command: infer Command,
) => unknown
  ? Command
  : never

export function createAgentApi(
  harness: HarnessContext,
  source: ScrumRuntimeSource,
  api: ScrumHostApi,
  sessionId: string,
): ScrumAgentApi {
  /**
   * Refuses before the call reaches a use case.
   *
   * Refusing here rather than inside the tool keeps the reason attributable:
   * a tool that checked for itself would be a second place the permission rule
   * lives, and the two would eventually disagree.
   */
  async function assertProjectAllows(permission: Permission): Promise<StoredProject> {
    const request = await resolveRequest(harness, source)
    const { project } = await requireBoundProject(request, harness)
    const authorization = await resolveProjectAuthorization(request.deps, {
      actor: request.actor,
      command: { projectId: project.project.id },
    })
    if (!authorization.permissions.has(permission)) {
      throw new ForbiddenError(`the current user may not ${permission}`, {
        permission,
        sessionId,
      })
    }
    return project
  }

  /**
   * A write, gated on a permission the current user must hold.
   *
   * The permission named here is the one the use case will check for the
   * ordinary case. Where the use case decides between two — moving your own
   * card versus anyone's — the gate names the weaker, because its question is
   * only whether the user may write at all; the role check that follows is
   * what decides which.
   */
  async function writing<Result>(
    permission: Permission,
    run: () => Promise<Result>,
  ): Promise<Result> {
    await assertProjectAllows(permission)
    return await run()
  }

  async function reading<Result>(
    permission: Permission,
    run: (project: StoredProject) => Result | Promise<Result>,
  ): Promise<Result> {
    return await run(await assertProjectAllows(permission))
  }

  return {
    version: api.version,
    // The gate already resolved the bound project, so reading it again would
    // be a second read that can disagree with the one the check ran against.
    project: async () => await reading(PERMISSION.projectView, (project) => project),
    backlog: async (filter?: WorkItemFilter) =>
      await reading(PERMISSION.backlogView, async () => await api.backlog(filter)),
    workItem: async (id: WorkItemId) =>
      await reading(PERMISSION.backlogView, async () => await api.workItem(id)),
    sprints: async () => await reading(PERMISSION.projectView, async () => await api.sprints()),
    sprint: async (id: SprintId) =>
      await reading(PERMISSION.projectView, async () => await api.sprint(id)),
    progress: async (id: SprintId) =>
      await reading(PERMISSION.reportView, async () => await api.progress(id)),

    createWorkItem: async (command) =>
      await writing(PERMISSION.workItemWrite, async () => await api.createWorkItem(command)),
    updateWorkItem: async (command) =>
      await writing(PERMISSION.workItemWrite, async () => await api.updateWorkItem(command)),
    moveWorkItemToRank: async (command) =>
      await writing(
        PERMISSION.backlogPrioritize,
        async () => await api.moveWorkItemToRank(command),
      ),
    moveWorkItemStatus: async (command) =>
      await writing(
        PERMISSION.workItemUpdateOwnStatus,
        async () => await api.moveWorkItemStatus(command),
      ),
    blockWorkItem: async (command) =>
      await writing(PERMISSION.workItemSetBlocked, async () => await api.blockWorkItem(command)),
    setWorkItemParent: async (command) =>
      await writing(PERMISSION.workItemWrite, async () => await api.setWorkItemParent(command)),
    setWorkItemDependency: async (command) =>
      await writing(PERMISSION.workItemWrite, async () => await api.setWorkItemDependency(command)),
    // Accepting is its own row in the matrix: writing down what done means and
    // declaring it met are different acts, given to different roles.
    setAcceptanceCriterion: async (command) =>
      await writing(
        PERMISSION.workItemAccept,
        async () => await api.setAcceptanceCriterion(command),
      ),
    deleteWorkItem: async (command) =>
      await writing(PERMISSION.workItemWrite, async () => await api.deleteWorkItem(command)),
    planSprint: async (command) =>
      await writing(PERMISSION.sprintAssignWorkItems, async () => await api.planSprint(command)),
    createSprint: async (command) =>
      await writing(PERMISSION.sprintCreate, async () => await api.createSprint(command)),
    startSprint: async (command) =>
      await writing(PERMISSION.sprintTransition, async () => await api.startSprint(command)),
    closeSprint: async (command) =>
      await writing(PERMISSION.sprintTransition, async () => await api.closeSprint(command)),
    configureProject: async (command) =>
      await writing(PERMISSION.projectConfigure, async () => await api.configureProject(command)),
  }
}
