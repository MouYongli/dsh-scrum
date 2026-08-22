import {
  ConflictError,
  NotFoundError,
  PERMISSION,
  ValidationError,
  assertSprintAcceptsWorkItems,
  assignWorkItemToSprint,
  closeSprint as closeSprintEntity,
  createSprint as createSprintEntity,
  isWorkItemFinished,
  removeWorkItemFromSprint,
  rescheduleSprint,
  startSprint as startSprintEntity,
  updateSprintDetails,
  type ProjectId,
  type Revision,
  type Sprint,
  type SprintId,
  type Timestamp,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import type { ActorContext, UseCaseRequest } from '../actor.js'
import { recordActivity } from '../activity.js'
import { authorizeProject } from '../authorization.js'
import type { ApplicationDependencies } from '../dependencies.js'
import { sprintProgress, type SprintProgress } from '../sprint-progress.js'
import type { SprintWrite, WorkItemWrite } from '../ports/transactions.js'

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

const IDENTIFIER_ATTEMPTS = 3

export interface CreateSprintCommand {
  readonly projectId: ProjectId
  readonly name: string
  readonly goal?: string | undefined
  readonly startDate: Timestamp
  readonly endDate: Timestamp
}

export async function createSprint(
  deps: Dependencies,
  request: UseCaseRequest<CreateSprintCommand>,
): Promise<Sprint> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.sprintCreate)

  for (let attempt = 1; ; attempt += 1) {
    const sprint = createSprintEntity({
      ...command,
      id: await deps.sprints.nextIdentifier(command.projectId),
      createdBy: actor.identityId,
      now: deps.clock.now(),
    })
    try {
      await deps.sprints.create(sprint)
    } catch (error) {
      if (error instanceof ConflictError && attempt < IDENTIFIER_ATTEMPTS) {
        continue
      }
      throw error
    }
    await report(deps, actor, 'sprint.create', sprint)
    return sprint
  }
}

export interface SprintCommand {
  readonly projectId: ProjectId
  readonly sprintId: SprintId
}

export async function getSprint(
  deps: Pick<Dependencies, 'projects' | 'members' | 'sprints' | 'capabilities'>,
  request: UseCaseRequest<SprintCommand>,
): Promise<Sprint> {
  await authorizeProject(deps, request.actor, request.command.projectId, PERMISSION.projectView)
  return await requireSprint(deps, request.command.projectId, request.command.sprintId)
}

export async function listSprints(
  deps: Pick<Dependencies, 'projects' | 'members' | 'sprints' | 'capabilities'>,
  request: UseCaseRequest<{ readonly projectId: ProjectId }>,
): Promise<readonly Sprint[]> {
  await authorizeProject(deps, request.actor, request.command.projectId, PERMISSION.projectView)
  return await deps.sprints.list(request.command.projectId)
}

export interface UpdateSprintCommand extends SprintCommand {
  readonly expectedRevision: Revision
  readonly name?: string | undefined
  readonly goal?: string | undefined
}

/** Renames a sprint or restates its goal, which stays editable while it runs. */
export async function updateSprint(
  deps: Dependencies,
  request: UseCaseRequest<UpdateSprintCommand>,
): Promise<Sprint> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.sprintSetGoal)
  const current = await requireSprint(deps, command.projectId, command.sprintId)
  assertExpectedSprintRevision(current, command.expectedRevision)
  const updated = updateSprintDetails(
    current,
    { name: command.name, goal: command.goal },
    deps.clock.now(),
  )
  await deps.sprints.save(updated, current.revision)
  await report(deps, actor, 'sprint.update', updated)
  return updated
}

export interface RescheduleSprintCommand extends SprintCommand {
  readonly expectedRevision: Revision
  readonly startDate: Timestamp
  readonly endDate: Timestamp
}

/**
 * Moves the dates, and takes `sprint.create` rather than `sprint.setGoal`.
 *
 * The dates are the box every burndown and every "did we finish on time"
 * answer is measured against, so moving them is setting the sprint up again
 * rather than rewording it. A role trusted to state the goal is not
 * automatically trusted to move the box. The domain refuses once the sprint
 * has started, for the same reason.
 */
export async function reschedule(
  deps: Dependencies,
  request: UseCaseRequest<RescheduleSprintCommand>,
): Promise<Sprint> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.sprintCreate)
  const current = await requireSprint(deps, command.projectId, command.sprintId)
  assertExpectedSprintRevision(current, command.expectedRevision)
  const moved = rescheduleSprint(current, command.startDate, command.endDate, deps.clock.now())
  await deps.sprints.save(moved, current.revision)
  await report(deps, actor, 'sprint.reschedule', moved)
  return moved
}

export interface StartSprintCommand extends SprintCommand {
  readonly expectedRevision: Revision
}

export async function startSprint(
  deps: Dependencies,
  request: UseCaseRequest<StartSprintCommand>,
): Promise<Sprint> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.sprintTransition)
  const current = await requireSprint(deps, command.projectId, command.sprintId)
  assertExpectedSprintRevision(current, command.expectedRevision)
  const started = startSprintEntity(
    current,
    await deps.sprints.list(command.projectId),
    deps.clock.now(),
  )
  await deps.sprints.save(started, current.revision)
  await report(deps, actor, 'sprint.start', started)
  return started
}

/** Where one unfinished item goes when its sprint closes. */
export interface Disposition {
  readonly workItemId: WorkItemId
  readonly expectedRevision: Revision
  /** The next sprint, or null to return the item to the backlog. */
  readonly moveTo: SprintId | null
}

export interface CloseSprintCommand extends SprintCommand {
  readonly expectedRevision: Revision
  readonly resultSummary?: string | undefined
  readonly dispositions: readonly Disposition[]
}

/**
 * Closes a sprint, and every unfinished item goes somewhere the caller named.
 *
 * A disposition is required for each rather than defaulted, because "back to
 * the backlog" and "into the next sprint" mean different things to the next
 * planning session and the tool cannot know which was meant. An unaccounted
 * item is refused with the list, so the caller can ask.
 *
 * The sprint and every moved item land as one write. A close that stopped
 * halfway would leave either a closed sprint still holding unfinished work or
 * unfinished work pointing at a sprint that never closed, and both are states
 * no report can read.
 */
export async function closeSprint(
  deps: Dependencies,
  request: UseCaseRequest<CloseSprintCommand>,
): Promise<Sprint> {
  const { actor, command } = request
  await authorizeProject(deps, actor, command.projectId, PERMISSION.sprintTransition)
  const current = await requireSprint(deps, command.projectId, command.sprintId)
  assertExpectedSprintRevision(current, command.expectedRevision)

  const assigned = await deps.workItems.list(command.projectId, { sprintId: current.id })
  const unfinished = assigned.filter((item) => !isWorkItemFinished(item))
  const dispositions = indexDispositions(command.dispositions, unfinished, current.id)

  const now = deps.clock.now()
  const workItems: WorkItemWrite[] = []
  const moved: WorkItem[] = []
  for (const item of unfinished) {
    const disposition = dispositions.get(item.id)!
    assertExpectedWorkItemRevision(item, disposition.expectedRevision)
    const next =
      disposition.moveTo === null
        ? removeWorkItemFromSprint(item, now)
        : assignWorkItemToSprint(
            item,
            await acceptingSprint(deps, command, disposition.moveTo),
            now,
          )
    workItems.push({ item: next, expected: item.revision })
    moved.push(next)
  }

  const closed = closeSprintEntity(
    current,
    moved.concat(assigned.filter(isWorkItemFinished)).map((item) => ({
      id: item.id,
      sprintId: item.sprintId,
      finished: isWorkItemFinished(item),
    })),
    command.resultSummary ?? '',
    now,
  )
  const sprints: SprintWrite[] = [{ sprint: closed, expected: current.revision }]
  await deps.transactions.apply('sprint.close', { workItems, sprints })

  await report(deps, actor, 'sprint.close', closed)
  for (const item of moved) {
    await recordActivity(deps, actor, {
      action: item.sprintId === null ? 'sprint.remove' : 'sprint.plan',
      targetType: 'workItem',
      targetId: item.id,
      revision: item.revision,
    })
  }
  return closed
}

/**
 * Pairs every unfinished item with its disposition, refusing an item nobody
 * decided about and a decision about an item that is not there.
 */
function indexDispositions(
  dispositions: readonly Disposition[],
  unfinished: readonly WorkItem[],
  sprintId: SprintId,
): ReadonlyMap<WorkItemId, Disposition> {
  const byId = new Map(dispositions.map((disposition) => [disposition.workItemId, disposition]))
  const expected = new Set(unfinished.map((item) => item.id))
  const undecided = unfinished.filter((item) => !byId.has(item.id)).map((item) => item.id)
  const unknown = [...byId.keys()].filter((id) => !expected.has(id))
  if (undecided.length > 0 || unknown.length > 0) {
    throw new ValidationError('every unfinished item needs a disposition', {
      sprintId,
      undecided,
      unknown,
    })
  }
  return byId
}

/** The sprint an item is being carried into, which must be able to take it. */
async function acceptingSprint(
  deps: Pick<Dependencies, 'sprints'>,
  command: CloseSprintCommand,
  moveTo: SprintId,
): Promise<SprintId> {
  if (moveTo === command.sprintId) {
    throw new ValidationError('an item cannot be carried into the sprint being closed', {
      sprintId: moveTo,
    })
  }
  assertSprintAcceptsWorkItems(await requireSprint(deps, command.projectId, moveTo))
  return moveTo
}

export type SprintProgressCommand = SprintCommand

/** Reads a sprint's progress. Derived on every call; nothing is stored. */
export async function readSprintProgress(
  deps: Pick<Dependencies, 'projects' | 'members' | 'workItems' | 'sprints' | 'capabilities'>,
  request: UseCaseRequest<SprintProgressCommand>,
): Promise<SprintProgress> {
  const { command } = request
  await authorizeProject(deps, request.actor, command.projectId, PERMISSION.reportView)
  const sprint = await requireSprint(deps, command.projectId, command.sprintId)
  return sprintProgress(sprint.id, await deps.workItems.list(command.projectId, {}))
}

export async function requireSprint(
  deps: Pick<Dependencies, 'sprints'>,
  projectId: ProjectId,
  sprintId: SprintId,
): Promise<Sprint> {
  const sprint = await deps.sprints.find(projectId, sprintId)
  if (sprint === null) {
    throw new NotFoundError('sprint', sprintId)
  }
  return sprint
}

function assertExpectedSprintRevision(sprint: Sprint, expected: Revision): void {
  if (sprint.revision !== expected) {
    throw new ConflictError('the sprint changed since it was read', expected, sprint.revision, {
      entityType: 'sprint',
      entityId: sprint.id,
    })
  }
}

function assertExpectedWorkItemRevision(item: WorkItem, expected: Revision): void {
  if (item.revision !== expected) {
    throw new ConflictError('the work item changed since it was read', expected, item.revision, {
      entityType: 'workItem',
      entityId: item.id,
    })
  }
}

async function report(
  deps: Pick<ApplicationDependencies, 'activity' | 'clock'>,
  actor: ActorContext,
  action: string,
  sprint: Sprint,
): Promise<void> {
  await recordActivity(deps, actor, {
    action,
    targetType: 'sprint',
    targetId: sprint.id,
    revision: sprint.revision,
  })
}
