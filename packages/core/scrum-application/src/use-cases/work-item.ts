import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PERMISSION,
  ValidationError,
  createWorkItem as createWorkItemEntity,
  rankBetween,
  setAcceptanceCriterionSatisfied,
  updateWorkItemDetails,
  type AcceptanceCriterion,
  type Permission,
  type Priority,
  type ProjectId,
  type Rank,
  type Revision,
  type WorkItem,
  type WorkItemDetailChanges,
  type WorkItemId,
  type WorkItemType,
} from '@dsh-scrum/scrum-domain'
import type { ActorContext, UseCaseRequest } from '../actor.js'
import { recordActivity } from '../activity.js'
import { authorizeProject, type AuthorizedProject } from '../authorization.js'
import type { ApplicationDependencies } from '../dependencies.js'
import type { WorkItemFilter } from '../ports/work-items.js'

export type Dependencies = Pick<
  ApplicationDependencies,
  'projects' | 'members' | 'workItems' | 'capabilities' | 'activity' | 'clock'
>

/** How many times a creator will ask for another identifier before giving up. */
const IDENTIFIER_ATTEMPTS = 3

export interface CreateWorkItemCommand {
  readonly projectId: ProjectId
  readonly type: WorkItemType
  readonly title: string
  readonly description?: string | undefined
  readonly priority?: Priority | undefined
  readonly labels?: readonly string[] | undefined
  readonly acceptanceCriteria?: readonly AcceptanceCriterion[] | undefined
  /** Where in the backlog it lands. Defaults to the end. */
  readonly after?: Rank | null | undefined
}

/**
 * Adds an item to the backlog.
 *
 * The identifier comes from the store and the creation is retried if someone
 * took it first: the two cannot be one step across a port with no transaction,
 * and a collision is exactly what asking again resolves. Anything other than a
 * taken identifier is reported rather than retried.
 */
export async function createWorkItem(
  deps: Dependencies,
  request: UseCaseRequest<CreateWorkItemCommand>,
): Promise<WorkItem> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.workItemWrite)
  const rank = await rankFor(deps, command.projectId, command.after)

  for (let attempt = 1; ; attempt += 1) {
    const item = createWorkItemEntity({
      ...command,
      id: await deps.workItems.nextIdentifier(command.projectId),
      reporterId: actor.identityId,
      rank,
      now: deps.clock.now(),
    })
    try {
      await deps.workItems.create(item)
    } catch (error) {
      if (error instanceof ConflictError && attempt < IDENTIFIER_ATTEMPTS) {
        continue
      }
      throw error
    }
    await report(deps, actor, 'workItem.create', item)
    return item
  }
}

/**
 * A new item goes between the one it was dropped behind and whatever followed
 * it, or at the end. Taking the follower into account is what makes "insert
 * after this" mean it: a rank computed from the predecessor alone would land
 * the item at the end of the list instead.
 *
 * The list is read in rank order, so adding an item still writes one file.
 */
async function rankFor(
  deps: Pick<Dependencies, 'workItems'>,
  projectId: ProjectId,
  after: Rank | null | undefined,
): Promise<Rank> {
  const existing = await deps.workItems.list(projectId, {})
  if (after === undefined || after === null) {
    return rankBetween(existing.at(-1)?.rank ?? null, null)
  }
  const index = existing.findIndex((item) => item.rank === after)
  if (index === -1) {
    throw new ValidationError('the item to insert after is not in this project', { after })
  }
  return rankBetween(after, existing[index + 1]?.rank ?? null)
}

export interface WorkItemCommand {
  readonly projectId: ProjectId
  readonly workItemId: WorkItemId
}

export async function getWorkItem(
  deps: Pick<Dependencies, 'projects' | 'members' | 'workItems' | 'capabilities'>,
  request: UseCaseRequest<WorkItemCommand>,
): Promise<WorkItem> {
  const { command } = request
  await authorizeProject(deps, request.actor, command.projectId, PERMISSION.backlogView)
  return await requireWorkItem(deps, command.projectId, command.workItemId)
}

export interface ListWorkItemsCommand {
  readonly projectId: ProjectId
  readonly filter?: WorkItemFilter | undefined
}

export async function listWorkItems(
  deps: Pick<Dependencies, 'projects' | 'members' | 'workItems' | 'capabilities'>,
  request: UseCaseRequest<ListWorkItemsCommand>,
): Promise<readonly WorkItem[]> {
  const { command } = request
  await authorizeProject(deps, request.actor, command.projectId, PERMISSION.backlogView)
  return await deps.workItems.list(command.projectId, command.filter ?? {})
}

export interface UpdateWorkItemCommand extends WorkItemCommand {
  readonly expectedRevision: Revision
  readonly changes: WorkItemDetailChanges
}

/**
 * Edits the detail panel fields.
 *
 * Which permissions this needs depends on what changed: estimating and setting
 * acceptance criteria are their own rows in the matrix, so an edit that
 * touches them has to satisfy those rows too. Bundling them under one write
 * permission would let a role that may not estimate estimate anyway by editing
 * the title in the same call.
 */
export async function updateWorkItem(
  deps: Dependencies,
  request: UseCaseRequest<UpdateWorkItemCommand>,
): Promise<WorkItem> {
  const { actor, command } = request
  const authorized = await authorizeProject(
    deps,
    actor,
    command.projectId,
    PERMISSION.workItemWrite,
  )
  for (const permission of extraPermissionsFor(command.changes)) {
    assertHeld(authorized, permission)
  }
  const current = await requireWorkItem(deps, command.projectId, command.workItemId)
  assertExpectedRevision(current, command.expectedRevision)
  const updated = updateWorkItemDetails(current, command.changes, deps.clock.now())
  await deps.workItems.save(updated, current.revision)
  await report(deps, actor, 'workItem.update', updated)
  return updated
}

function extraPermissionsFor(changes: WorkItemDetailChanges): readonly Permission[] {
  const needed: Permission[] = []
  if (changes.estimate !== undefined) {
    needed.push(PERMISSION.workItemEstimate)
  }
  if (changes.acceptanceCriteria !== undefined) {
    needed.push(PERMISSION.workItemSetAcceptanceCriteria)
  }
  return needed
}

export interface SetAcceptanceCriterionCommand extends WorkItemCommand {
  readonly expectedRevision: Revision
  readonly index: number
  readonly satisfied: boolean
}

/**
 * Ticks one criterion off. Governed by `workItem.accept` rather than by the
 * permission that defines the criteria: writing down what "done" means and
 * declaring it met are different acts, and the matrix gives them to different
 * roles.
 */
export async function setAcceptanceCriterion(
  deps: Dependencies,
  request: UseCaseRequest<SetAcceptanceCriterionCommand>,
): Promise<WorkItem> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.workItemAccept)
  const current = await requireWorkItem(deps, command.projectId, command.workItemId)
  assertExpectedRevision(current, command.expectedRevision)
  const updated = setAcceptanceCriterionSatisfied(
    current,
    command.index,
    command.satisfied,
    deps.clock.now(),
  )
  await deps.workItems.save(updated, current.revision)
  await report(deps, actor, 'workItem.accept', updated)
  return updated
}

export async function requireWorkItem(
  deps: Pick<Dependencies, 'workItems'>,
  projectId: ProjectId,
  workItemId: WorkItemId,
): Promise<WorkItem> {
  const item = await deps.workItems.find(projectId, workItemId)
  if (item === null) {
    throw new NotFoundError('work item', workItemId)
  }
  return item
}

/**
 * Refuses a caller working from a version that has since moved on.
 *
 * The store checks this again when the write lands, and that check is the one
 * that makes overwriting impossible. This one runs first so the refusal can
 * name the entity and both revisions, which is what a client needs to decide
 * between reloading and merging.
 */
export function assertExpectedRevision(item: WorkItem, expected: Revision): void {
  if (item.revision !== expected) {
    throw new ConflictError('the work item changed since it was read', expected, item.revision, {
      entityType: 'workItem',
      entityId: item.id,
    })
  }
}

/** Refuses a permission the already-resolved principal turns out not to hold. */
export function assertHeld(authorized: AuthorizedProject, permission: Permission): void {
  if (!authorized.permissions.has(permission)) {
    throw new ForbiddenError(`the actor may not ${permission}`, {
      permission,
      roles: [...authorized.roles],
    })
  }
}

export async function report(
  deps: Pick<ApplicationDependencies, 'activity' | 'clock'>,
  actor: ActorContext,
  action: string,
  item: WorkItem,
): Promise<void> {
  await recordActivity(deps, actor, {
    action,
    targetType: 'workItem',
    targetId: item.id,
    revision: item.revision,
  })
}
