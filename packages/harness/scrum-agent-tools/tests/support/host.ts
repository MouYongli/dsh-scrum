import {
  CAPABILITY,
  ConflictError,
  createDefaultProjectConfig,
  createOwnerMember,
  formatSprintId,
  formatWorkItemId,
  toIdentityId,
  toProjectKey,
  toTenantId,
  toTimestamp,
  type IdentityId,
  type Project,
  type ProjectId,
  type ProjectMember,
  type Revision,
  type Sprint,
  type SprintId,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import {
  ACCESS_MODE,
  filterWorkItems,
  setSessionAccess,
  type AccessMode,
  type ApplicationDependencies,
  type AtomicWrites,
  type NewProject,
  type SessionAccess,
  type StoredProject,
  type WorkItemFilter,
  type WorkspaceBinding,
  type WorkspaceRef,
} from '@dsh-scrum/scrum-application'
import {
  createAgentApi,
  createHostApi,
  type HarnessContext,
  type HarnessWorkspace,
  type ScrumAgentApi,
  type ScrumRuntime,
} from '@dsh-scrum/scrum-harness-host'

// A host wired to an in-memory store, only as complete as the read tools
// need. The real store arrives with the edition bundle.

const TENANT = toTenantId('tnt_01K00000000000000000000001')
export const IDENTITY = toIdentityId('idt_01K00000000000000000000001')
export const NOW = toTimestamp('2026-08-22T09:00:00.000Z')
export const SESSION_ID = 'session_1'
export const WORKSPACE: HarnessWorkspace = {
  id: 'ws_1',
  path: '/home/me/shop-service',
  name: 'shop-service',
}

export interface Store {
  readonly projects: Map<ProjectId, StoredProject>
  readonly owners: Map<ProjectId, ProjectMember>
  readonly bindings: Map<string, WorkspaceBinding>
  readonly sessions: Map<string, SessionAccess>
  readonly workItems: Map<WorkItemId, WorkItem>
  readonly sprints: Map<string, Sprint>
  /** Every identity a use case acted as, so a test can see whose call it was. */
  readonly actors: IdentityId[]
  /** Everything recorded, so a test can read the provenance back. */
  readonly activity: {
    action: string
    actorId: string
    source: string
    sessionId: string | null
    targetId: string
  }[]
}

export function store(): Store {
  return {
    projects: new Map(),
    owners: new Map(),
    bindings: new Map(),
    sessions: new Map(),
    workItems: new Map(),
    sprints: new Map(),
    actors: [],
    activity: [],
  }
}

function key(workspace: WorkspaceRef): string {
  return `${workspace.instanceId}/${workspace.workspaceId}`
}

function dependencies(state: Store): ApplicationDependencies {
  let issued = 0
  return {
    ids: { nextUlid: () => `01K${String((issued += 1)).padStart(23, '0')}` },
    clock: { now: () => NOW },
    capabilities: new Set([CAPABILITY.core]),
    projects: {
      find: async (id) => state.projects.get(id) ?? null,
      create: async (project: NewProject) => {
        state.projects.set(project.project.id, {
          project: project.project,
          config: project.config,
        })
        state.owners.set(project.project.id, project.owner)
      },
      save: async (project: Project, expected: Revision) => {
        const current = state.projects.get(project.id)
        if (current === undefined || current.project.revision !== expected) {
          throw new ConflictError('the project changed since it was read', expected, 0, {})
        }
        state.projects.set(project.id, { ...current, project })
      },
      saveConfig: async (config, expected: Revision) => {
        const current = state.projects.get(config.projectId)
        if (current === undefined || current.config.revision !== expected) {
          throw new ConflictError('the configuration changed since it was read', expected, 0, {})
        }
        state.projects.set(config.projectId, { ...current, config })
      },
    },
    members: {
      find: async (projectId: ProjectId, identityId: IdentityId) => {
        state.actors.push(identityId)
        const owner = state.owners.get(projectId)
        return owner !== undefined && owner.identityId === identityId ? owner : null
      },
    },
    bindings: {
      find: async (workspace) => state.bindings.get(key(workspace)) ?? null,
      save: async (binding) => {
        state.bindings.set(key(binding.workspace), binding)
      },
      remove: async (workspace) => {
        state.bindings.delete(key(workspace))
      },
    },
    sessions: {
      find: async (instanceId: string, sessionId: string) =>
        state.sessions.get(`${instanceId}/${sessionId}`) ?? null,
      save: async (access: SessionAccess) => {
        state.sessions.set(`${access.harnessInstanceId}/${access.sessionId}`, access)
      },
    },
    workItems: {
      find: async (projectId: ProjectId, id: WorkItemId) => {
        const found = state.workItems.get(id)
        return found !== undefined && found.projectId === projectId ? found : null
      },
      list: async (projectId: ProjectId, filter: WorkItemFilter) =>
        filterWorkItems(
          [...state.workItems.values()].filter((item) => item.projectId === projectId),
          filter,
        ),
      nextIdentifier: async () => formatWorkItemId(toProjectKey('SCR'), state.workItems.size + 1),
      create: async (item: WorkItem) => {
        state.workItems.set(item.id, item)
      },
      save: async (item: WorkItem) => {
        state.workItems.set(item.id, item)
      },
      remove: async (_projectId: ProjectId, id: WorkItemId) => {
        state.workItems.delete(id)
      },
    },
    sprints: {
      find: async (projectId: ProjectId, id: SprintId) =>
        state.sprints.get(`${projectId}/${id}`) ?? null,
      list: async (projectId: ProjectId) =>
        [...state.sprints.values()].filter((sprint) => sprint.projectId === projectId),
      nextIdentifier: async () => formatSprintId(state.sprints.size + 1),
      create: async (sprint: Sprint) => {
        state.sprints.set(`${sprint.projectId}/${sprint.id}`, sprint)
      },
      save: async (sprint: Sprint) => {
        state.sprints.set(`${sprint.projectId}/${sprint.id}`, sprint)
      },
    },
    transactions: {
      apply: async (_operation: string, writes: AtomicWrites) => {
        for (const write of writes.workItems ?? []) {
          state.workItems.set(write.item.id, write.item)
        }
        for (const write of writes.sprints ?? []) {
          state.sprints.set(`${write.sprint.projectId}/${write.sprint.id}`, write.sprint)
        }
      },
    },
    activity: {
      record: async (event) => {
        state.activity.push({
          action: event.action,
          actorId: event.actorId,
          source: event.source,
          sessionId: event.sessionId,
          targetId: event.targetId,
        })
      },
    },
    idempotency: { find: async () => null, save: async () => undefined },
  }
}

export function harness(): HarnessContext {
  return {
    instanceId: 'dsh_local_1',
    currentWorkspace: async () => WORKSPACE,
    currentSession: async () => ({ id: SESSION_ID, workspaceId: WORKSPACE.id }),
  }
}

function runtime(state: Store): ScrumRuntime {
  return {
    identity: async () => IDENTITY,
    tenant: async () => TENANT,
    forWorkspace: async () => dependencies(state),
  }
}

/** A bound project whose creator is a member, with the session set as asked. */
export async function boundHost(
  state: Store,
  mode: AccessMode = ACCESS_MODE.read,
): Promise<{ api: ScrumAgentApi; projectId: ProjectId }> {
  const context = harness()
  const host = createHostApi(context, runtime(state))
  const created = await host.initialise({ key: toProjectKey('SCR'), name: 'shop-service' })
  state.owners.set(
    created.project.id,
    createOwnerMember({
      ids: { nextUlid: () => '01K00000000000000000000009' },
      projectId: created.project.id,
      identityId: IDENTITY,
      now: NOW,
    }),
  )
  state.projects.set(created.project.id, {
    project: created.project,
    config: createDefaultProjectConfig(created.project.id, NOW),
  })
  if (mode !== ACCESS_MODE.off) {
    await setSessionAccess(dependencies(state), {
      actor: { identityId: IDENTITY, source: 'ui', sessionId: SESSION_ID },
      command: {
        harnessInstanceId: 'dsh_local_1',
        sessionId: SESSION_ID,
        projectId: created.project.id,
        mode,
      },
    })
  }
  state.actors.length = 0
  state.activity.length = 0
  return {
    api: createAgentApi(context, runtime(state), host, SESSION_ID),
    projectId: created.project.id,
  }
}
