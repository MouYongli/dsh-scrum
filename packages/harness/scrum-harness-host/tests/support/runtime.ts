import {
  CAPABILITY,
  ConflictError,
  createOwnerMember,
  toIdentityId,
  toTenantId,
  toTimestamp,
  toWorkItemId,
  type Clock,
  type IdGenerator,
  type IdentityId,
  type Project,
  type ProjectId,
  type ProjectMember,
  type Revision,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import {
  filterWorkItems,
  type ApplicationDependencies,
  type NewProject,
  type StoredProject,
  type WorkItemFilter,
  type WorkspaceBinding,
  type WorkspaceRef,
} from '@dsh-scrum/scrum-application'
import type {
  HarnessContext,
  HarnessSession,
  HarnessWorkspace,
  ScrumRuntime,
} from '@dsh-scrum/scrum-harness-host'

export type { HarnessSession, HarnessWorkspace }

// A store that lives in memory, only as complete as the entry states need. The
// real one arrives with the edition bundle; building the host against a stub
// keeps this package free of a filesystem it must not reach for anyway.

export const IDENTITY = toIdentityId('idt_01K00000000000000000000001')
export const TENANT = toTenantId('tnt_01K00000000000000000000001')
export const NOW = toTimestamp('2026-08-22T09:00:00.000Z')

export const WORKSPACE: HarnessWorkspace = {
  id: 'ws_1',
  path: '/home/me/shop-service',
  name: 'shop-service',
}

export class MemoryStore {
  readonly projects = new Map<ProjectId, StoredProject>()
  readonly owners = new Map<ProjectId, ProjectMember>()
  readonly bindings = new Map<string, WorkspaceBinding>()
  readonly workItems = new Map<WorkItemId, WorkItem>()
}

function key(workspace: WorkspaceRef): string {
  return `${workspace.instanceId}/${workspace.workspaceId}`
}

export function dependencies(store: MemoryStore): ApplicationDependencies {
  let issued = 0
  const ids: IdGenerator = {
    nextUlid: () => `01K${String((issued += 1)).padStart(23, '0')}`,
  }
  const clock: Clock = { now: () => NOW }
  return {
    ids,
    clock,
    capabilities: new Set([CAPABILITY.core]),
    projects: {
      find: async (id: ProjectId) => store.projects.get(id) ?? null,
      create: async (project: NewProject) => {
        store.projects.set(project.project.id, {
          project: project.project,
          config: project.config,
        })
        store.owners.set(project.project.id, project.owner)
      },
      save: async (project: Project, expected: Revision) => {
        const current = store.projects.get(project.id)
        if (current === undefined || current.project.revision !== expected) {
          throw new ConflictError('the project changed since it was read', expected, 0, {})
        }
        store.projects.set(project.id, { ...current, project })
      },
      saveConfig: async (config, expected: Revision) => {
        const current = store.projects.get(config.projectId)
        if (current === undefined || current.config.revision !== expected) {
          throw new ConflictError('the configuration changed since it was read', expected, 0, {})
        }
        store.projects.set(config.projectId, { ...current, config })
      },
    },
    members: {
      find: async (projectId: ProjectId, identityId: IdentityId) => {
        const owner = store.owners.get(projectId)
        return owner !== undefined && owner.identityId === identityId ? owner : null
      },
    },
    bindings: {
      find: async (workspace: WorkspaceRef) => store.bindings.get(key(workspace)) ?? null,
      save: async (binding: WorkspaceBinding) => {
        store.bindings.set(key(binding.workspace), binding)
      },
      remove: async (workspace: WorkspaceRef) => {
        store.bindings.delete(key(workspace))
      },
    },
    workItems: {
      find: async (_projectId: ProjectId, id: WorkItemId) => store.workItems.get(id) ?? null,
      list: async (projectId: ProjectId, filter: WorkItemFilter) =>
        filterWorkItems(
          [...store.workItems.values()].filter((item) => item.projectId === projectId),
          filter,
        ),
      nextIdentifier: async (projectId: ProjectId) => {
        const project = store.projects.get(projectId)
        return toWorkItemId(`${project?.project.key ?? 'SCR'}-${store.workItems.size + 1}`)
      },
      create: async (item: WorkItem) => {
        if (store.workItems.has(item.id)) {
          throw new ConflictError('work item already exists', 0, 0, { id: item.id })
        }
        store.workItems.set(item.id, item)
      },
      // The revision check is the point of the stub, not an accident of it:
      // every write in this package carries an expected revision, and a store
      // that accepted a stale one would make those tests prove nothing.
      save: async (item: WorkItem, expected: Revision) => {
        const current = store.workItems.get(item.id)
        if (current !== undefined && current.revision !== expected) {
          throw new ConflictError('work item was modified', expected, current.revision, {
            id: item.id,
          })
        }
        store.workItems.set(item.id, item)
      },
      remove: async (_projectId: ProjectId, id: WorkItemId) => {
        store.workItems.delete(id)
      },
    },
    sprints: notComposed('sprints'),
    transactions: notComposed('transactions'),
    activity: { record: async () => undefined },
    sprintProgressLog: notComposed('sprintProgressLog'),
    idempotency: { find: async () => null, save: async () => undefined },
  } as ApplicationDependencies
}

/** Anything the entry states do not need refuses loudly rather than lying. */
function notComposed(what: string): never {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(`${what} are not composed in this stub`)
      },
    },
  ) as never
}

export function runtime(store: MemoryStore): ScrumRuntime {
  return {
    identity: async () => IDENTITY,
    tenant: async () => TENANT,
    forWorkspace: async () => dependencies(store),
  }
}

export function harness(
  workspace: HarnessWorkspace | null = WORKSPACE,
  session: HarnessSession | null = null,
): HarnessContext {
  return {
    instanceId: 'dsh_local_1',
    currentWorkspace: async () => workspace,
    currentSession: async () => session,
  }
}

export function ownerOf(projectId: ProjectId): ProjectMember {
  return createOwnerMember({
    ids: { nextUlid: () => '01K00000000000000000000009' },
    projectId,
    identityId: IDENTITY,
    now: NOW,
  })
}
