import type {
  AcceptanceCriterion,
  Priority,
  Rank,
  Revision,
  WorkItem,
  WorkItemDetailChanges,
  WorkItemId,
  WorkItemType,
} from '@dsh-scrum/scrum-domain'

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

/** What the workbench found when it opened. Mirrors the host's entry states. */
export type EntryView =
  | { readonly state: 'no-workspace' }
  | { readonly state: 'unbound'; readonly workspace: WorkspaceView }
  | { readonly state: 'stale'; readonly workspace: WorkspaceView }
  | {
      readonly state: 'bound' | 'archived'
      readonly workspace: WorkspaceView
      readonly project: ProjectView
      readonly moved: boolean
    }

export interface CreateProjectInput {
  readonly key: string
  readonly name: string
  readonly description?: string | undefined
}

/**
 * Which items the screen is asking for.
 *
 * A narrower shape than the store's filter, holding only what the backlog
 * screen offers. `planned` is the one field with no counterpart there: it is
 * how the screen says "the product backlog" (items in no sprint) as opposed to
 * "everything", and the adapter turns it into the sprint narrowing the store
 * understands.
 */
export interface BacklogQuery {
  readonly text?: string | undefined
  readonly types?: readonly WorkItemType[] | undefined
  readonly priorities?: readonly Priority[] | undefined
  readonly labels?: readonly string[] | undefined
  readonly blocked?: boolean | undefined
  /** `false` narrows to items in no sprint; absent means both. */
  readonly planned?: boolean | undefined
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

export interface ScrumClient {
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
}
