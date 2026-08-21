import { ValidationError } from './errors.js'
import type { IdentityId, ProjectId, SprintId } from './ids.js'
import { createEntityMetadata, touchEntityMetadata, type EntityMetadata } from './metadata.js'
import { requireOptionalText, requireText } from './text.js'
import { compareTimestamps, type Timestamp } from './time.js'

const MAX_NAME_LENGTH = 120
const MAX_GOAL_LENGTH = 1000
const MAX_RESULT_SUMMARY_LENGTH = 5000

/**
 * Where a sprint is in its life. The string values are persisted, so they may
 * be added to but never renamed.
 */
export const SPRINT_STATUS = {
  planned: 'planned',
  active: 'active',
  closed: 'closed',
} as const

export type SprintStatus = (typeof SPRINT_STATUS)[keyof typeof SPRINT_STATUS]

const STATUSES: readonly string[] = Object.values(SPRINT_STATUS)

export function toSprintStatus(value: string): SprintStatus {
  if (!STATUSES.includes(value)) {
    throw new ValidationError(`SprintStatus must be one of ${STATUSES.join(', ')}`, { value })
  }
  return value as SprintStatus
}

/**
 * A time-boxed iteration.
 *
 * `startDate` and `endDate` are the box the team agreed to; `startedAt` and
 * `closedAt` are when it actually opened and shut. Keeping both apart is what
 * lets a report say a sprint ran late rather than quietly redefining when it
 * was supposed to end.
 *
 * The sprint never lists its work items. Membership is the work item's
 * `sprintId` and only that, so planning one item is one write and the two
 * sides cannot disagree about who is in.
 */
export interface Sprint extends EntityMetadata {
  readonly id: SprintId
  readonly projectId: ProjectId
  readonly name: string
  readonly goal: string
  readonly status: SprintStatus
  readonly startDate: Timestamp
  readonly endDate: Timestamp
  readonly startedAt: Timestamp | null
  readonly closedAt: Timestamp | null
  readonly resultSummary: string
  readonly createdBy: IdentityId
}

export interface CreateSprintInput {
  readonly id: SprintId
  readonly projectId: ProjectId
  readonly name: string
  readonly goal?: string | undefined
  readonly startDate: Timestamp
  readonly endDate: Timestamp
  readonly createdBy: IdentityId
  readonly now: Timestamp
}

export function createSprint(input: CreateSprintInput): Sprint {
  requireOrderedDates(input.startDate, input.endDate)
  return {
    ...createEntityMetadata(input.now),
    id: input.id,
    projectId: input.projectId,
    name: requireText(input.name, 'Sprint name', MAX_NAME_LENGTH),
    goal: requireOptionalText(input.goal ?? '', 'Sprint goal', MAX_GOAL_LENGTH),
    status: SPRINT_STATUS.planned,
    startDate: input.startDate,
    endDate: input.endDate,
    startedAt: null,
    closedAt: null,
    resultSummary: '',
    createdBy: input.createdBy,
  }
}

export interface SprintDetailChanges {
  readonly name?: string | undefined
  readonly goal?: string | undefined
}

/**
 * The name and goal stay editable while the sprint runs: a goal that turns out
 * to be worded badly on day two is worth fixing, and refusing would only push
 * teams to keep the real goal somewhere the tool cannot see.
 */
export function updateSprintDetails(
  sprint: Sprint,
  changes: SprintDetailChanges,
  now: Timestamp,
): Sprint {
  assertNotClosed(sprint, 'be edited')
  return {
    ...sprint,
    ...touchEntityMetadata(sprint, now),
    name:
      changes.name === undefined
        ? sprint.name
        : requireText(changes.name, 'Sprint name', MAX_NAME_LENGTH),
    goal:
      changes.goal === undefined
        ? sprint.goal
        : requireOptionalText(changes.goal, 'Sprint goal', MAX_GOAL_LENGTH),
  }
}

/**
 * Dates move only while the sprint is still planned. Rescheduling one that has
 * started rewrites the box every burndown, velocity figure and "did we finish
 * on time" answer is measured against, which is how a team ends up always
 * having delivered on schedule.
 */
export function rescheduleSprint(
  sprint: Sprint,
  startDate: Timestamp,
  endDate: Timestamp,
  now: Timestamp,
): Sprint {
  if (sprint.status !== SPRINT_STATUS.planned) {
    throw new ValidationError('only a planned sprint can be rescheduled', {
      sprintId: sprint.id,
      status: sprint.status,
    })
  }
  requireOrderedDates(startDate, endDate)
  return { ...sprint, ...touchEntityMetadata(sprint, now), startDate, endDate }
}

function requireOrderedDates(startDate: Timestamp, endDate: Timestamp): void {
  if (compareTimestamps(startDate, endDate) >= 0) {
    throw new ValidationError('a sprint must end after it starts', { startDate, endDate })
  }
}

function assertNotClosed(sprint: Sprint, action: string): void {
  if (sprint.status === SPRINT_STATUS.closed) {
    throw new ValidationError(`a closed sprint cannot ${action}`, {
      sprintId: sprint.id,
      status: sprint.status,
    })
  }
}

export function isSprintActive(sprint: Sprint): boolean {
  return sprint.status === SPRINT_STATUS.active
}

/**
 * Opens a sprint. The project's other sprints are required rather than
 * optional, because "at most one active sprint" can only be checked where the
 * others are visible, and a caller that had to remember to check separately is
 * a caller that will forget.
 */
export function startSprint(
  sprint: Sprint,
  projectSprints: Iterable<Sprint>,
  now: Timestamp,
): Sprint {
  if (sprint.status !== SPRINT_STATUS.planned) {
    throw new ValidationError('only a planned sprint can be started', {
      sprintId: sprint.id,
      status: sprint.status,
    })
  }
  for (const other of projectSprints) {
    if (other.id !== sprint.id && isSprintActive(other)) {
      throw new ValidationError('the project already has an active sprint', {
        sprintId: sprint.id,
        activeSprintId: other.id,
      })
    }
  }
  return {
    ...sprint,
    ...touchEntityMetadata(sprint, now),
    status: SPRINT_STATUS.active,
    startedAt: now,
  }
}

/**
 * What a sprint needs to know about the work assigned to it in order to close.
 * Deliberately not `WorkItem`: closing depends on whether each item is
 * finished and nothing else, and taking the whole entity would let a later
 * change quietly make the sprint depend on the rest of it.
 */
export interface SprintWorkItemState {
  readonly id: string
  readonly sprintId: SprintId | null
  readonly finished: boolean
}

/**
 * Closes a sprint, refusing while any assigned item is still unfinished.
 *
 * The disposition itself happens outside: returning an item to the backlog or
 * carrying it into the next sprint are work item operations, and doing them
 * here would make closing a write across two aggregates that no single
 * revision check covers. This is the guard that makes sure it happened.
 */
export function closeSprint(
  sprint: Sprint,
  workItems: Iterable<SprintWorkItemState>,
  resultSummary: string,
  now: Timestamp,
): Sprint {
  if (sprint.status !== SPRINT_STATUS.active) {
    throw new ValidationError('only an active sprint can be closed', {
      sprintId: sprint.id,
      status: sprint.status,
    })
  }
  const unfinished = unfinishedSprintWorkItems(sprint, workItems)
  if (unfinished.length > 0) {
    throw new ValidationError('every unfinished item must be dealt with before closing', {
      sprintId: sprint.id,
      unfinished: [...unfinished],
    })
  }
  return {
    ...sprint,
    ...touchEntityMetadata(sprint, now),
    status: SPRINT_STATUS.closed,
    closedAt: now,
    resultSummary: requireOptionalText(
      resultSummary,
      'Sprint result summary',
      MAX_RESULT_SUMMARY_LENGTH,
    ),
  }
}

/** The items standing between a sprint and closing, for the disposition screen. */
export function unfinishedSprintWorkItems(
  sprint: Sprint,
  workItems: Iterable<SprintWorkItemState>,
): readonly string[] {
  const unfinished: string[] = []
  for (const item of workItems) {
    if (item.sprintId === sprint.id && !item.finished) {
      unfinished.push(item.id)
    }
  }
  return unfinished
}

/**
 * Guard for planning work into a sprint. A closed sprint is a record of what
 * was delivered, so admitting new work would rewrite a history that reports
 * have already been drawn from.
 */
export function assertSprintAcceptsWorkItems(sprint: Sprint): void {
  if (sprint.status === SPRINT_STATUS.closed) {
    throw new ValidationError('a closed sprint does not accept work items', {
      sprintId: sprint.id,
      status: sprint.status,
    })
  }
}
