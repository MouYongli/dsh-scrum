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
  type ProjectConfig,
  type ProjectMember,
  type Project,
  type Revision,
  type Timestamp,
  type Sprint,
  type SprintId,
  formatSprintId,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import {
  ACTIVITY_SOURCE,
  type ActivityEvent,
  type ActivityHistory,
  type ActivityWindow,
  type SprintProgressEntry,
  type ActorContext,
  type ApplicationDependencies,
  type IdempotencyKey,
  type IdempotencyRecord,
  type NewProject,
  type StoredProject,
  type AtomicWrites,
  type WorkItemFilter,
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

  async saveConfig(config: ProjectConfig, expected: Revision): Promise<void> {
    const current = this.stored.get(config.projectId)
    if (current === undefined || current.config.revision !== expected) {
      throw new ConflictError(
        'the project configuration changed since it was read',
        expected,
        current?.config.revision ?? 0,
        {},
      )
    }
    this.stored.set(config.projectId, { ...current, config })
  }
}

export class FakeWorkItemRepository {
  readonly projects: FakeProjectRepository
  readonly items = new Map<WorkItemId, WorkItem>()
  /** How many more times to hand out a number that is already taken. */
  collisions = 0

  readonly hook: WriteHook

  constructor(projects: FakeProjectRepository, hook: WriteHook) {
    this.projects = projects
    this.hook = hook
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
    const colliding = this.collisions > 0
    this.collisions = Math.max(this.collisions - 1, 0)
    return formatWorkItemId(project.project.key, Math.max(colliding ? taken : taken + 1, 1))
  }

  async create(item: WorkItem): Promise<void> {
    if (this.items.has(item.id)) {
      throw new ConflictError('the work item already exists', 0, item.revision, { id: item.id })
    }
    this.items.set(item.id, item)
  }

  async save(item: WorkItem, expected: Revision): Promise<void> {
    this.hook.run()
    this.assertExpected(item, expected)
    this.items.set(item.id, item)
  }

  async remove(projectId: ProjectId, id: WorkItemId, expected: Revision): Promise<void> {
    const current = this.items.get(id)
    if (current === undefined || current.projectId !== projectId) {
      throw new ConflictError('the work item is no longer there', expected, 0, { id })
    }
    this.assertExpected(current, expected)
    this.items.delete(id)
  }

  assertExpected(item: WorkItem, expected: Revision): void {
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

/**
 * Sprint identifiers are only unique inside a project — `sprint-1` says
 * nothing about which project it belongs to, unlike `SCR-12` — so the store
 * keys them by both.
 */
export class FakeSprintRepository {
  readonly sprints = new Map<string, Sprint>()
  /** How many more times to hand out a number that is already taken. */
  collisions = 0

  get(projectId: ProjectId, id: SprintId): Sprint | undefined {
    return this.sprints.get(`${projectId}/${id}`)
  }

  async find(projectId: ProjectId, id: SprintId): Promise<Sprint | null> {
    return this.get(projectId, id) ?? null
  }

  async list(projectId: ProjectId): Promise<readonly Sprint[]> {
    return [...this.sprints.values()].filter((sprint) => sprint.projectId === projectId)
  }

  async nextIdentifier(projectId: ProjectId): Promise<SprintId> {
    const taken = (await this.list(projectId)).length
    const colliding = this.collisions > 0
    this.collisions = Math.max(this.collisions - 1, 0)
    return formatSprintId(Math.max(colliding ? taken : taken + 1, 1))
  }

  async create(sprint: Sprint): Promise<void> {
    if (this.get(sprint.projectId, sprint.id) !== undefined) {
      throw new ConflictError('the sprint already exists', 0, sprint.revision, { id: sprint.id })
    }
    this.add(sprint)
  }

  async save(sprint: Sprint, expected: Revision): Promise<void> {
    this.assertExpected(sprint, expected)
    this.add(sprint)
  }

  assertExpected(sprint: Sprint, expected: Revision): void {
    const current = this.get(sprint.projectId, sprint.id)
    if (current === undefined) {
      throw new ConflictError('the sprint is no longer there', expected, 0, { id: sprint.id })
    }
    if (current.revision !== expected) {
      throw new ConflictError('the sprint changed since it was read', expected, current.revision, {
        id: sprint.id,
      })
    }
  }

  add(sprint: Sprint): void {
    this.sprints.set(`${sprint.projectId}/${sprint.id}`, sprint)
  }
}

/**
 * A place for a test to stand a concurrent writer, immediately before the next
 * write reaches storage. Shared by the stores so a batch and a single write
 * both pass through it.
 */
export class WriteHook {
  beforeNext: (() => void) | null = null

  run(): void {
    const hook = this.beforeNext
    this.beforeNext = null
    hook?.()
  }
}

export class FakeTransactions {
  readonly workItems: FakeWorkItemRepository
  readonly sprints: FakeSprintRepository
  readonly hook: WriteHook
  readonly applied: string[] = []

  constructor(workItems: FakeWorkItemRepository, sprints: FakeSprintRepository, hook: WriteHook) {
    this.workItems = workItems
    this.sprints = sprints
    this.hook = hook
  }

  async apply(operation: string, writes: AtomicWrites): Promise<void> {
    this.hook.run()
    for (const write of writes.workItems ?? []) {
      this.workItems.assertExpected(write.item, write.expected)
    }
    for (const write of writes.sprints ?? []) {
      this.sprints.assertExpected(write.sprint, write.expected)
    }
    for (const write of writes.workItems ?? []) {
      this.workItems.items.set(write.item.id, write.item)
    }
    for (const write of writes.sprints ?? []) {
      this.sprints.add(write.sprint)
    }
    this.applied.push(operation)
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

export class FakeActivityLog {
  readonly events: ActivityEvent[] = []
  readonly problems: string[] = []
  failWith: Error | null = null

  async record(event: ActivityEvent): Promise<void> {
    if (this.failWith !== null) {
      throw this.failWith
    }
    this.events.push(event)
  }

  async read(window: ActivityWindow): Promise<ActivityHistory> {
    const events = this.events
      .filter((event) => window.since === undefined || event.at >= window.since)
      .sort((left, right) => right.at.localeCompare(left.at))
      .slice(0, window.limit)
    return await Promise.resolve({ events, problems: this.problems })
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

export class FakeSprintProgressLog {
  readonly entries: SprintProgressEntry[] = []
  failWith: Error | null = null

  async append(entry: SprintProgressEntry): Promise<void> {
    if (this.failWith !== null) {
      throw this.failWith
    }
    this.entries.push(entry)
  }

  async read(sprintId: SprintId): Promise<readonly SprintProgressEntry[]> {
    return this.entries.filter((entry) => entry.sprintId === sprintId)
  }
}

export interface TestDependencies extends ApplicationDependencies {
  readonly projects: FakeProjectRepository
  readonly workItems: FakeWorkItemRepository
  readonly sprints: FakeSprintRepository
  readonly transactions: FakeTransactions
  readonly writes: WriteHook
  readonly members: FakeMemberRepository
  readonly bindings: FakeBindingRepository
  readonly activity: FakeActivityLog
  readonly sprintProgressLog: FakeSprintProgressLog
  readonly idempotency: FakeIdempotencyStore
  readonly clock: Clock & { set(at: Timestamp): void }
}

/** Community's capabilities: everything the matrix gates on except `rbac`. */
export function capabilities(...granted: Capability[]): ReadonlySet<Capability> {
  return new Set(granted.length === 0 ? [CAPABILITY.core] : granted)
}

export function dependencies(overrides: Partial<TestDependencies> = {}): TestDependencies {
  const projects = overrides.projects ?? new FakeProjectRepository()
  const writes = overrides.writes ?? new WriteHook()
  const workItems = overrides.workItems ?? new FakeWorkItemRepository(projects, writes)
  const sprints = overrides.sprints ?? new FakeSprintRepository()
  return {
    projects,
    workItems,
    sprints,
    writes,
    transactions: new FakeTransactions(workItems, sprints, writes),
    members: new FakeMemberRepository(),
    bindings: new FakeBindingRepository(),
    activity: new FakeActivityLog(),
    sprintProgressLog: new FakeSprintProgressLog(),
    idempotency: new FakeIdempotencyStore(),
    capabilities: capabilities(),
    clock: testClock(),
    ids: testIds(),
    ...overrides,
  }
}
