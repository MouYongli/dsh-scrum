import {
  CAPABILITY,
  ConflictError,
  formatWorkItemId,
  toIdentityId,
  toTimestamp,
  type Capability,
  type Clock,
  type IdGenerator,
  type IdentityId,
  type ProjectId,
  type ProjectMember,
  type Project,
  type Revision,
  type Timestamp,
  type Sprint,
  type SprintId,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import {
  ACTIVITY_SOURCE,
  type ActivityEvent,
  type ActorContext,
  type ApplicationDependencies,
  type IdempotencyKey,
  type IdempotencyRecord,
  type NewProject,
  type StoredProject,
  type WorkItemFilter,
  type WorkItemWrite,
  type WorkspaceBinding,
  type WorkspaceRef,
  filterWorkItems,
} from '@dsh-scrum/scrum-application'

// In-memory stand-ins for every port. They are deliberately not mocks: a use
// case test that asserts against a call log passes when the call order changes
// and the behaviour breaks. These behave like the real thing, including the
// refusals, so the assertions can be about state.

export const NOW = toTimestamp('2026-08-22T09:00:00.000Z')
export const ACTOR_ID = toIdentityId('idt_01K00000000000000000000001')
export const OTHER_ID = toIdentityId('idt_01K00000000000000000000002')

export function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return { identityId: ACTOR_ID, source: ACTIVITY_SOURCE.ui, sessionId: null, ...overrides }
}

export function testClock(start: Timestamp = NOW): Clock & { set(at: Timestamp): void } {
  let at = start
  return {
    now: () => at,
    set: (next: Timestamp) => {
      at = next
    },
  }
}

/** Deterministic ULID bodies, so a generated identifier is readable in a failure. */
export function testIds(): IdGenerator {
  let issued = 0
  return {
    nextUlid: () => {
      issued += 1
      return `01K${String(issued).padStart(23, '0')}`
    },
  }
}

export class FakeProjectRepository {
  readonly stored = new Map<ProjectId, StoredProject>()
  readonly owners = new Map<ProjectId, ProjectMember>()

  async find(id: ProjectId): Promise<StoredProject | null> {
    return this.stored.get(id) ?? null
  }

  async create(project: NewProject): Promise<void> {
    if (this.stored.has(project.project.id)) {
      throw new ConflictError('the project already exists', 0, project.project.revision, {})
    }
    this.stored.set(project.project.id, { project: project.project, config: project.config })
    this.owners.set(project.project.id, project.owner)
  }

  async save(project: Project, expected: Revision): Promise<void> {
    const current = this.stored.get(project.id)
    if (current === undefined) {
      throw new ConflictError('the project is no longer there', expected, 0, {})
    }
    if (current.project.revision !== expected) {
      throw new ConflictError(
        'the project changed since it was read',
        expected,
        current.project.revision,
        {},
      )
    }
    this.stored.set(project.id, { ...current, project })
  }
}

export class FakeWorkItemRepository {
  readonly projects: FakeProjectRepository
  readonly items = new Map<WorkItemId, WorkItem>()
  /** Hands out the same number twice, to exercise the allocation race. */
  collideOnce = false

  constructor(projects: FakeProjectRepository) {
    this.projects = projects
  }

  async find(projectId: ProjectId, id: WorkItemId): Promise<WorkItem | null> {
    const found = this.items.get(id)
    return found !== undefined && found.projectId === projectId ? found : null
  }

  async list(projectId: ProjectId, filter: WorkItemFilter): Promise<readonly WorkItem[]> {
    const owned = [...this.items.values()].filter((item) => item.projectId === projectId)
    return filterWorkItems(owned, filter)
  }

  async nextIdentifier(projectId: ProjectId): Promise<WorkItemId> {
    const project = this.projects.stored.get(projectId)
    if (project === undefined) {
      throw new ConflictError('the project is not there', 0, 0, {})
    }
    const taken = [...this.items.values()].filter((item) => item.projectId === projectId).length
    const next = this.collideOnce ? taken : taken + 1
    this.collideOnce = false
    return formatWorkItemId(project.project.key, Math.max(next, 1))
  }

  async create(item: WorkItem): Promise<void> {
    if (this.items.has(item.id)) {
      throw new ConflictError('the work item already exists', 0, item.revision, { id: item.id })
    }
    this.items.set(item.id, item)
  }

  async save(item: WorkItem, expected: Revision): Promise<void> {
    this.assertExpected(item, expected)
    this.items.set(item.id, item)
  }

  async saveAll(writes: readonly WorkItemWrite[]): Promise<void> {
    for (const write of writes) {
      this.assertExpected(write.item, write.expected)
    }
    for (const write of writes) {
      this.items.set(write.item.id, write.item)
    }
  }

  async remove(projectId: ProjectId, id: WorkItemId, expected: Revision): Promise<void> {
    const current = this.items.get(id)
    if (current === undefined || current.projectId !== projectId) {
      throw new ConflictError('the work item is no longer there', expected, 0, { id })
    }
    this.assertExpected(current, expected)
    this.items.delete(id)
  }

  private assertExpected(item: WorkItem, expected: Revision): void {
    const current = this.items.get(item.id)
    if (current === undefined) {
      throw new ConflictError('the work item is no longer there', expected, 0, { id: item.id })
    }
    if (current.revision !== expected) {
      throw new ConflictError(
        'the work item changed since it was read',
        expected,
        current.revision,
        {
          id: item.id,
        },
      )
    }
  }
}

export class FakeSprintRepository {
  readonly sprints = new Map<SprintId, Sprint>()

  async find(projectId: ProjectId, id: SprintId): Promise<Sprint | null> {
    const found = this.sprints.get(id)
    return found !== undefined && found.projectId === projectId ? found : null
  }

  async list(projectId: ProjectId): Promise<readonly Sprint[]> {
    return [...this.sprints.values()].filter((sprint) => sprint.projectId === projectId)
  }

  add(sprint: Sprint): void {
    this.sprints.set(sprint.id, sprint)
  }
}

export class FakeMemberRepository {
  readonly members = new Map<string, ProjectMember>()

  async find(projectId: ProjectId, identityId: IdentityId): Promise<ProjectMember | null> {
    return this.members.get(`${projectId}/${identityId}`) ?? null
  }

  add(member: ProjectMember): void {
    this.members.set(`${member.projectId}/${member.identityId}`, member)
  }
}

export class FakeBindingRepository {
  readonly bindings = new Map<string, WorkspaceBinding>()
  removable = true

  async find(workspace: WorkspaceRef): Promise<WorkspaceBinding | null> {
    return this.bindings.get(keyOf(workspace)) ?? null
  }

  async save(binding: WorkspaceBinding): Promise<void> {
    this.bindings.set(keyOf(binding.workspace), binding)
  }

  async remove(workspace: WorkspaceRef): Promise<void> {
    if (!this.removable) {
      throw new ConflictError('this edition cannot detach a workspace', 0, 0, {})
    }
    this.bindings.delete(keyOf(workspace))
  }
}

function keyOf(workspace: WorkspaceRef): string {
  return `${workspace.instanceId}/${workspace.workspaceId}`
}

export class FakeActivityRecorder {
  readonly events: ActivityEvent[] = []
  failWith: Error | null = null

  async record(event: ActivityEvent): Promise<void> {
    if (this.failWith !== null) {
      throw this.failWith
    }
    this.events.push(event)
  }
}

export class FakeIdempotencyStore {
  readonly records = new Map<IdempotencyKey, IdempotencyRecord>()

  async find(key: IdempotencyKey): Promise<IdempotencyRecord | null> {
    return this.records.get(key) ?? null
  }

  async save(record: IdempotencyRecord): Promise<void> {
    if (this.records.has(record.key)) {
      throw new ConflictError('this idempotency key is already recorded', 0, 0, { key: record.key })
    }
    this.records.set(record.key, record)
  }
}

export interface TestDependencies extends ApplicationDependencies {
  readonly projects: FakeProjectRepository
  readonly workItems: FakeWorkItemRepository
  readonly sprints: FakeSprintRepository
  readonly members: FakeMemberRepository
  readonly bindings: FakeBindingRepository
  readonly activity: FakeActivityRecorder
  readonly idempotency: FakeIdempotencyStore
  readonly clock: Clock & { set(at: Timestamp): void }
}

/** Community's capabilities: everything the matrix gates on except `rbac`. */
export function capabilities(...granted: Capability[]): ReadonlySet<Capability> {
  return new Set(granted.length === 0 ? [CAPABILITY.core] : granted)
}

export function dependencies(overrides: Partial<TestDependencies> = {}): TestDependencies {
  const projects = overrides.projects ?? new FakeProjectRepository()
  return {
    projects,
    workItems: new FakeWorkItemRepository(projects),
    sprints: new FakeSprintRepository(),
    members: new FakeMemberRepository(),
    bindings: new FakeBindingRepository(),
    activity: new FakeActivityRecorder(),
    idempotency: new FakeIdempotencyStore(),
    capabilities: capabilities(),
    clock: testClock(),
    ids: testIds(),
    ...overrides,
  }
}
