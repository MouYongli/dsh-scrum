import type {
  AcceptanceCriterion,
  Permission,
  ProjectRole,
  Priority,
  Rank,
  Revision,
  Sprint,
  SprintId,
  Timestamp,
  WorkItem,
  WorkItemDetailChanges,
  WorkItemId,
  WorkItemStatus,
  WorkItemType,
  Edition,
} from '@dsh-scrum/scrum-domain'

export interface AuthorizationView {
  readonly permissions: readonly Permission[]
  readonly projectArchived: boolean
  readonly membership: {
    readonly mode: 'personal' | 'managed'
    readonly roles: readonly ProjectRole[]
  }
}

/**
 * What the interface needs from whatever is behind it.
 *
 * Deliberately not the host's types: this package is edition-independent and
 * must not learn the shape of a workspace binding or a stored project. It
 * receives a view and sends a command, and a remote edition can satisfy the
 * same interface over the wire.
 *
 * Entities do come from `scrum-domain`, because a second declaration of a work
 * item would be a copy that drifts from the one the store writes and the agent
 * reads. The domain package is pure data and rules — depending on it costs the
 * interface nothing it has to run.
 */
export interface ProjectView {
  readonly id: string
  readonly key: string
  readonly name: string
  readonly description: string
}

export interface WorkspaceView {
  readonly id: string
  readonly name: string
}

export interface RuntimeContextView {
  readonly edition: Edition
  readonly serviceName: string
  readonly tenantName: string
}

/** What the workbench found when it opened. Mirrors the host's entry states. */
type EntryWithoutRuntime =
  | { readonly state: 'no-workspace' }
  | { readonly state: 'unbound'; readonly workspace: WorkspaceView }
  | { readonly state: 'stale'; readonly workspace: WorkspaceView }
  | {
      readonly state: 'bound' | 'archived'
      readonly workspace: WorkspaceView
      readonly project: ProjectView
      readonly moved: boolean
    }

export type EntryView = EntryWithoutRuntime & {
  readonly runtimeContext?: RuntimeContextView
}

export interface CreateProjectInput {
  readonly key: string
  readonly name: string
  readonly description?: string | undefined
}

/**
 * Which items the screen is asking for.
 *
 * A narrower shape than the store's filter, holding only what the screens
 * offer. `sprintId` carries three answers and needs all three: an identifier
 * is one sprint's board, `null` is the product backlog, and leaving it out is
 * every item in the project. A boolean could not say which sprint, and the
 * board asks exactly that.
 */
export interface BacklogQuery {
  readonly text?: string | undefined
  readonly types?: readonly WorkItemType[] | undefined
  readonly priorities?: readonly Priority[] | undefined
  readonly labels?: readonly string[] | undefined
  readonly blocked?: boolean | undefined
  readonly sprintId?: SprintId | null | undefined
}

/**
 * The item a write is aimed at, and the revision the user was looking at.
 *
 * Every write carries one. A command without an expected revision is a command
 * that can overwrite a change the user never saw, and there is no screen state
 * where that is the right thing to do.
 */
export interface WorkItemRef {
  readonly workItemId: WorkItemId
  readonly expectedRevision: Revision
}

export interface NewWorkItem {
  readonly type: WorkItemType
  readonly title: string
  readonly description?: string | undefined
  readonly priority?: Priority | undefined
  readonly labels?: readonly string[] | undefined
  readonly acceptanceCriteria?: readonly AcceptanceCriterion[] | undefined
}

export interface EditWorkItem extends WorkItemRef {
  readonly changes: WorkItemDetailChanges
}

export interface SetCriterion extends WorkItemRef {
  readonly index: number
  readonly satisfied: boolean
}

/** The neighbours an item was dropped between, in backlog order. */
export interface RankWorkItem extends WorkItemRef {
  readonly after: Rank | null
  readonly before: Rank | null
}

export interface ParentWorkItem extends WorkItemRef {
  readonly parentId: WorkItemId | null
}

export interface DependWorkItem extends WorkItemRef {
  readonly dependsOnId: WorkItemId
  readonly linked: boolean
}

export interface BlockWorkItem extends WorkItemRef {
  /** `null` clears the block; a reason is required to set one. */
  readonly reason: string | null
}

export interface MoveWorkItemStatus extends WorkItemRef {
  readonly status: WorkItemStatus
}

/**
 * A new sprint.
 *
 * The dates are part of creating it, not something set afterwards: they are
 * the box the team agreed to and the baseline every "was it on time" question
 * is measured against.
 */
export interface NewSprint {
  readonly name: string
  readonly goal?: string | undefined
  readonly startDate: Timestamp
  readonly endDate: Timestamp
}

export interface SprintRef {
  readonly sprintId: SprintId
  readonly expectedRevision: Revision
}

/** Moving work into a sprint, or out of one when `sprintId` is `null`. */
export interface PlanSprint {
  readonly sprintId: SprintId | null
  readonly items: readonly WorkItemRef[]
}

/** Where one unfinished item goes when its sprint closes. */
export interface Disposition extends WorkItemRef {
  /** The next sprint, or `null` to return the item to the backlog. */
  readonly moveTo: SprintId | null
}

export interface CloseSprint extends SprintRef {
  readonly resultSummary?: string | undefined
  readonly dispositions: readonly Disposition[]
}

export interface ScrumClient {
  /** What the current user may do in the bound project, resolved on every call. */
  authorization(): Promise<AuthorizationView>
  entry(): Promise<EntryView>
  createProject(input: CreateProjectInput): Promise<ProjectView>
  backlog(query?: BacklogQuery): Promise<readonly WorkItem[]>
  createWorkItem(input: NewWorkItem): Promise<WorkItem>
  updateWorkItem(command: EditWorkItem): Promise<WorkItem>
  setAcceptanceCriterion(command: SetCriterion): Promise<WorkItem>
  moveWorkItemToRank(command: RankWorkItem): Promise<WorkItem>
  setWorkItemParent(command: ParentWorkItem): Promise<WorkItem>
  setWorkItemDependency(command: DependWorkItem): Promise<WorkItem>
  blockWorkItem(command: BlockWorkItem): Promise<WorkItem>
  moveWorkItemStatus(command: MoveWorkItemStatus): Promise<WorkItem>
  sprints(): Promise<readonly Sprint[]>
  createSprint(input: NewSprint): Promise<Sprint>
  planSprint(command: PlanSprint): Promise<readonly WorkItem[]>
  startSprint(command: SprintRef): Promise<Sprint>
  closeSprint(command: CloseSprint): Promise<Sprint>
}
