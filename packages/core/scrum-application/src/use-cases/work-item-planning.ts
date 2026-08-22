import {
  NotFoundError,
  PERMISSION,
  addWorkItemDependency,
  assertSprintAcceptsWorkItems,
  assertWorkItemDeletable,
  assignWorkItemToSprint,
  blockWorkItem as blockWorkItemEntity,
  moveWorkItemRank,
  moveWorkItemStatus as moveWorkItemStatusEntity,
  rankBetween,
  removeWorkItemDependency,
  removeWorkItemFromSprint,
  setWorkItemParent as setWorkItemParentEntity,
  unblockWorkItem as unblockWorkItemEntity,
  workItemReferences,
  type ProjectId,
  type Rank,
  type Revision,
  type SprintId,
  type WorkItem,
  type WorkItemId,
  type WorkItemReferences,
  type WorkItemStatus,
} from '@dsh-scrum/scrum-domain'
import type { UseCaseRequest } from '../actor.js'
import { authorizeProject } from '../authorization.js'
import type { ApplicationDependencies } from '../dependencies.js'
import type { WorkItemWrite } from '../ports/transactions.js'
import {
  assertExpectedRevision,
  assertHeld,
  report,
  requireWorkItem,
  type WorkItemCommand,
} from './work-item.js'

type Dependencies = Pick<
  ApplicationDependencies,
  | 'projects'
  | 'members'
  | 'workItems'
  | 'sprints'
  | 'transactions'
  | 'capabilities'
  | 'activity'
  | 'clock'
>

export interface MoveWorkItemRankCommand extends WorkItemCommand {
  readonly expectedRevision: Revision
  /** The neighbours it was dropped between, in backlog order. */
  readonly after: Rank | null
  readonly before: Rank | null
}

/**
 * Reorders one item. The rank is derived from the two neighbours the caller
 * dropped it between, so a drag writes exactly the file that moved and never
 * renumbers the list.
 */
export async function moveWorkItemToRank(
  deps: Dependencies,
  request: UseCaseRequest<MoveWorkItemRankCommand>,
): Promise<WorkItem> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.backlogPrioritize)
  const current = await requireWorkItem(deps, command.projectId, command.workItemId)
  assertExpectedRevision(current, command.expectedRevision)
  const moved = moveWorkItemRank(
    current,
    rankBetween(command.after, command.before),
    deps.clock.now(),
  )
  await deps.workItems.save(moved, current.revision)
  await report(deps, actor, 'workItem.rank', moved)
  return moved
}

export interface MoveWorkItemStatusCommand extends WorkItemCommand {
  readonly expectedRevision: Revision
  readonly status: WorkItemStatus
}

/**
 * Moves a card across the board.
 *
 * Which permission it takes depends on whose card it is. The matrix separates
 * updating your own status from updating anyone's, and the assignee is what
 * tells them apart — so a developer can move their own work without being
 * given the right to move everyone else's.
 */
export async function moveWorkItemStatus(
  deps: Dependencies,
  request: UseCaseRequest<MoveWorkItemStatusCommand>,
): Promise<WorkItem> {
  const { actor, command } = request
  const authorized = await authorizeProject(deps, actor, command.projectId, PERMISSION.backlogView)
  const current = await requireWorkItem(deps, command.projectId, command.workItemId)
  assertExpectedRevision(current, command.expectedRevision)
  assertHeld(
    authorized,
    current.assigneeId === actor.identityId
      ? PERMISSION.workItemUpdateOwnStatus
      : PERMISSION.workItemUpdateAnyStatus,
  )
  const moved = moveWorkItemStatusEntity(current, command.status, deps.clock.now())
  await deps.workItems.save(moved, current.revision)
  await report(deps, actor, 'workItem.status', moved)
  return moved
}

export interface BlockWorkItemCommand extends WorkItemCommand {
  readonly expectedRevision: Revision
  /** The reason, or null to clear the block. */
  readonly reason: string | null
}

export async function blockWorkItem(
  deps: Dependencies,
  request: UseCaseRequest<BlockWorkItemCommand>,
): Promise<WorkItem> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.workItemSetBlocked)
  const current = await requireWorkItem(deps, command.projectId, command.workItemId)
  assertExpectedRevision(current, command.expectedRevision)
  const now = deps.clock.now()
  const updated =
    command.reason === null
      ? unblockWorkItemEntity(current, now)
      : blockWorkItemEntity(current, command.reason, now)
  await deps.workItems.save(updated, current.revision)
  await report(
    deps,
    actor,
    command.reason === null ? 'workItem.unblock' : 'workItem.block',
    updated,
  )
  return updated
}

export interface SetWorkItemParentCommand extends WorkItemCommand {
  readonly expectedRevision: Revision
  readonly parentId: WorkItemId | null
}

export async function setWorkItemParent(
  deps: Dependencies,
  request: UseCaseRequest<SetWorkItemParentCommand>,
): Promise<WorkItem> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.workItemWrite)
  const current = await requireWorkItem(deps, command.projectId, command.workItemId)
  assertExpectedRevision(current, command.expectedRevision)
  const updated = setWorkItemParentEntity(
    current,
    command.parentId,
    await lookup(deps, command.projectId),
    deps.clock.now(),
  )
  await deps.workItems.save(updated, current.revision)
  await report(deps, actor, 'workItem.parent', updated)
  return updated
}

export interface WorkItemDependencyCommand extends WorkItemCommand {
  readonly expectedRevision: Revision
  readonly dependsOnId: WorkItemId
  readonly linked: boolean
}

export async function setWorkItemDependency(
  deps: Dependencies,
  request: UseCaseRequest<WorkItemDependencyCommand>,
): Promise<WorkItem> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.workItemWrite)
  const current = await requireWorkItem(deps, command.projectId, command.workItemId)
  assertExpectedRevision(current, command.expectedRevision)
  const now = deps.clock.now()
  const updated = command.linked
    ? addWorkItemDependency(
        current,
        command.dependsOnId,
        await lookup(deps, command.projectId),
        now,
      )
    : removeWorkItemDependency(current, command.dependsOnId, now)
  await deps.workItems.save(updated, current.revision)
  await report(deps, actor, command.linked ? 'workItem.dependOn' : 'workItem.undepend', updated)
  return updated
}

export interface DeleteWorkItemCommand extends WorkItemCommand {
  readonly expectedRevision: Revision
}

/**
 * Deletes an item, refusing while anything still points at it.
 *
 * The refusal carries the children and dependants, so the caller can say what
 * to detach rather than reporting that deletion failed and leaving the user to
 * work out why.
 */
export async function deleteWorkItem(
  deps: Dependencies,
  request: UseCaseRequest<DeleteWorkItemCommand>,
): Promise<WorkItemReferences> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.workItemWrite)
  const current = await requireWorkItem(deps, command.projectId, command.workItemId)
  assertExpectedRevision(current, command.expectedRevision)
  const items = await deps.workItems.list(command.projectId, {})
  assertWorkItemDeletable(current, items)
  await deps.workItems.remove(command.projectId, current.id, current.revision)
  await report(deps, actor, 'workItem.delete', current)
  return workItemReferences(current, items)
}

export interface PlanSprintCommand {
  readonly projectId: ProjectId
  /** The sprint to plan into, or null to return the items to the backlog. */
  readonly sprintId: SprintId | null
  readonly items: readonly {
    readonly workItemId: WorkItemId
    readonly expectedRevision: Revision
  }[]
}

/**
 * Moves many items into or out of a sprint in one decision.
 *
 * Every revision is checked and every move computed before anything is
 * written, and the store is asked to apply the batch as one. A planning
 * session that landed half its moves would leave a sprint holding part of a
 * decision nobody made, and the person who made it with no way to tell which
 * part.
 */
export async function planSprint(
  deps: Dependencies,
  request: UseCaseRequest<PlanSprintCommand>,
): Promise<readonly WorkItem[]> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.sprintAssignWorkItems)
  if (command.sprintId !== null) {
    assertSprintAcceptsWorkItems(await requireSprint(deps, command.projectId, command.sprintId))
  }

  const now = deps.clock.now()
  const writes: WorkItemWrite[] = []
  for (const planned of command.items) {
    const current = await requireWorkItem(deps, command.projectId, planned.workItemId)
    assertExpectedRevision(current, planned.expectedRevision)
    writes.push({
      item:
        command.sprintId === null
          ? removeWorkItemFromSprint(current, now)
          : assignWorkItemToSprint(current, command.sprintId, now),
      expected: current.revision,
    })
  }

  await deps.transactions.apply('sprint.plan', { workItems: writes })
  for (const write of writes) {
    await report(
      deps,
      actor,
      command.sprintId === null ? 'sprint.remove' : 'sprint.plan',
      write.item,
    )
  }
  return writes.map((write) => write.item)
}

async function requireSprint(
  deps: Pick<Dependencies, 'sprints'>,
  projectId: ProjectId,
  sprintId: SprintId,
) {
  const sprint = await deps.sprints.find(projectId, sprintId)
  if (sprint === null) {
    throw new NotFoundError('sprint', sprintId)
  }
  return sprint
}

/** The graph rules need every item in the project, and a map already is one. */
async function lookup(
  deps: Pick<Dependencies, 'workItems'>,
  projectId: ProjectId,
): Promise<ReadonlyMap<WorkItemId, WorkItem>> {
  const items = await deps.workItems.list(projectId, {})
  return new Map(items.map((item) => [item.id, item]))
}
