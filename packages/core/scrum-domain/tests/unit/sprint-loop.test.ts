import { describe, expect, it } from 'vitest'
import {
  ERROR_CODE,
  SPRINT_STATUS,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  assertSprintAcceptsWorkItems,
  assignWorkItemToSprint,
  closeSprint,
  createSprint,
  createWorkItem,
  isScrumError,
  isWorkItemFinished,
  moveWorkItemStatus,
  rankBetween,
  removeWorkItemFromSprint,
  startSprint,
  toIdentityId,
  toProjectId,
  toSprintId,
  toTimestamp,
  toWorkItemId,
  unfinishedSprintWorkItems,
  type Sprint,
  type SprintWorkItemState,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const PROJECT = toProjectId(`prj_${ULID}`)
const OWNER = toIdentityId(`idt_${ULID}`)

function at(hour: number) {
  return toTimestamp(`2026-08-20T${String(hour).padStart(2, '0')}:00:00Z`)
}

function caughtFrom(run: () => unknown): unknown {
  try {
    run()
    return undefined
  } catch (error) {
    return error
  }
}

function sprintNamed(id: string): Sprint {
  return createSprint({
    id: toSprintId(id),
    projectId: PROJECT,
    name: id,
    startDate: toTimestamp('2026-09-01T00:00:00Z'),
    endDate: toTimestamp('2026-09-15T00:00:00Z'),
    createdBy: OWNER,
    now: at(9),
  })
}

function itemNamed(key: string, rankAfter: WorkItem | null): WorkItem {
  return createWorkItem({
    id: toWorkItemId(key),
    projectId: PROJECT,
    type: WORK_ITEM_TYPE.story,
    title: key,
    reporterId: OWNER,
    rank: rankBetween(rankAfter?.rank ?? null, null),
    now: at(9),
  })
}

/** The projection a sprint needs, built from the work items themselves. */
function stateOf(item: WorkItem): SprintWorkItemState {
  return { id: item.id, sprintId: item.sprintId, finished: isWorkItemFinished(item) }
}

// The first version's whole promise, run end to end against the aggregates:
// build a backlog, plan a sprint, start it, advance the board, and close with
// the unfinished work dealt with. Each piece is covered on its own elsewhere;
// this is the proof that they compose, and it is where a rule that is correct
// in isolation but wrong in sequence shows up.
describe('the first version loop', () => {
  it('runs from an empty backlog to a closed sprint', () => {
    // Backlog, ordered.
    const first = itemNamed('SCR-1', null)
    const second = itemNamed('SCR-2', first)
    expect([first, second].every((item) => item.status === WORK_ITEM_STATUS.backlog)).toBe(true)
    expect(first.rank < second.rank).toBe(true)

    // Plan both into a sprint that has not started.
    const sprint = sprintNamed('sprint-1')
    assertSprintAcceptsWorkItems(sprint)
    const plannedFirst = assignWorkItemToSprint(first, sprint.id, at(10))
    const plannedSecond = assignWorkItemToSprint(second, sprint.id, at(10))
    expect(plannedFirst.status).toBe(WORK_ITEM_STATUS.todo)

    // Start it, then advance one item across the board.
    const active = startSprint(sprint, [sprint], at(11))
    const started = moveWorkItemStatus(plannedFirst, WORK_ITEM_STATUS.inProgress, at(12))
    const reviewing = moveWorkItemStatus(started, WORK_ITEM_STATUS.review, at(13))
    const done = moveWorkItemStatus(reviewing, WORK_ITEM_STATUS.done, at(14))

    // The second item did not land, so the sprint refuses to close.
    const before = [done, plannedSecond].map(stateOf)
    expect(unfinishedSprintWorkItems(active, before)).toEqual([plannedSecond.id])
    expect(isScrumError(caughtFrom(() => closeSprint(active, before, '', at(15))))).toBe(true)

    // Deal with it by returning it to the backlog, then close.
    const returned = removeWorkItemFromSprint(plannedSecond, at(15))
    const closed = closeSprint(active, [done, returned].map(stateOf), '交付了一项', at(16))

    expect(returned.status).toBe(WORK_ITEM_STATUS.backlog)
    expect(returned.sprintId).toBeNull()
    expect(closed.status).toBe(SPRINT_STATUS.closed)
    // The delivered item keeps the sprint that delivered it.
    expect(done.sprintId).toBe(sprint.id)
  })

  it('carries unfinished work into the next sprint instead of the backlog', () => {
    const sprint = startSprint(sprintNamed('sprint-1'), [sprintNamed('sprint-1')], at(10))
    const next = sprintNamed('sprint-2')
    const item = moveWorkItemStatus(
      assignWorkItemToSprint(itemNamed('SCR-1', null), sprint.id, at(11)),
      WORK_ITEM_STATUS.inProgress,
      at(12),
    )

    const carried = assignWorkItemToSprint(item, next.id, at(13))
    const closed = closeSprint(sprint, [carried].map(stateOf), '', at(14))
    const started = startSprint(next, [closed, next], at(15))

    expect(carried.sprintId).toBe(next.id)
    // Carrying work forward must not reset the progress already made on it.
    expect(carried.status).toBe(WORK_ITEM_STATUS.inProgress)
    expect(started.status).toBe(SPRINT_STATUS.active)
  })

  // Both invariants the architecture states about sprints and statuses hold
  // because of how the two are tied together, not because anything checks
  // them at close time.
  it('never leaves a backlog item in a sprint, or an unfinished item outside the board columns', () => {
    const sprint = startSprint(sprintNamed('sprint-1'), [sprintNamed('sprint-1')], at(10))
    const planned = assignWorkItemToSprint(itemNamed('SCR-1', null), sprint.id, at(11))
    const returned = removeWorkItemFromSprint(planned, at(12))

    expect(returned.status === WORK_ITEM_STATUS.backlog && returned.sprintId === null).toBe(true)

    const error = caughtFrom(() => moveWorkItemStatus(planned, WORK_ITEM_STATUS.backlog, at(12)))
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
  })
})
