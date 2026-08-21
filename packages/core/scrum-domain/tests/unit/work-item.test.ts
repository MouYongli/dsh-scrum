import { describe, expect, it } from 'vitest'
import {
  ERROR_CODE,
  PRIORITY,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  assignWorkItemToSprint,
  blockWorkItem,
  createWorkItem,
  isScrumError,
  isWorkItemAccepted,
  isWorkItemBlocked,
  isWorkItemFinished,
  moveWorkItemRank,
  moveWorkItemStatus,
  rankBetween,
  removeWorkItemFromSprint,
  setAcceptanceCriterionSatisfied,
  toIdentityId,
  toPriority,
  toProjectId,
  toSprintId,
  toTimestamp,
  toWorkItemId,
  toWorkItemType,
  unblockWorkItem,
  updateWorkItemDetails,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const PROJECT = toProjectId(`prj_${ULID}`)
const REPORTER = toIdentityId(`idt_${ULID}`)
const SPRINT = toSprintId('sprint-1')
const NEXT_SPRINT = toSprintId('sprint-2')
const T1 = toTimestamp('2026-08-20T10:00:00Z')
const T2 = toTimestamp('2026-08-20T11:00:00Z')
const T3 = toTimestamp('2026-08-20T12:00:00Z')
const T4 = toTimestamp('2026-08-20T13:00:00Z')

function caughtFrom(run: () => unknown): unknown {
  try {
    run()
    return undefined
  } catch (error) {
    return error
  }
}

function expectRejects(run: () => unknown, what: string): void {
  const error = caughtFrom(run)
  expect(isScrumError(error) && error.code, `expected ${what} to be rejected`).toBe(
    ERROR_CODE.validation,
  )
}

function item(): WorkItem {
  return createWorkItem({
    id: toWorkItemId('SCR-1'),
    projectId: PROJECT,
    type: WORK_ITEM_TYPE.story,
    title: '  用户使用优惠券  ',
    reporterId: REPORTER,
    rank: rankBetween(null, null),
    now: T1,
  })
}

function inSprint(): WorkItem {
  return assignWorkItemToSprint(item(), SPRINT, T2)
}

describe('work item creation', () => {
  it('starts in the backlog, in no sprint, unblocked', () => {
    const created = item()

    expect(created.status).toBe(WORK_ITEM_STATUS.backlog)
    expect(created.sprintId).toBeNull()
    expect(created.parentId).toBeNull()
    expect(created.dependsOn).toEqual([])
    expect(created.priority).toBe(PRIORITY.medium)
    expect(created.title).toBe('用户使用优惠券')
    expect(created.estimate).toBeNull()
    expect(isWorkItemBlocked(created)).toBe(false)
    expect(created.revision).toBe(1)
  })

  it('rejects a blank title and an estimate outside its bounds', () => {
    const base = {
      id: toWorkItemId('SCR-1'),
      projectId: PROJECT,
      type: WORK_ITEM_TYPE.task,
      reporterId: REPORTER,
      rank: rankBetween(null, null),
      now: T1,
    }

    expectRejects(() => createWorkItem({ ...base, title: '  ' }), 'a blank title')
    expectRejects(
      () => createWorkItem({ ...base, title: 'x', estimate: -1 }),
      'a negative estimate',
    )
    expectRejects(
      () => createWorkItem({ ...base, title: 'x', estimate: Number.NaN }),
      'an estimate that is not a number',
    )
    expect(createWorkItem({ ...base, title: 'x', estimate: 0 }).estimate).toBe(0)
  })

  it('accepts only the published type and priority spellings', () => {
    expect(toWorkItemType('bug')).toBe(WORK_ITEM_TYPE.bug)
    expect(toPriority('critical')).toBe(PRIORITY.critical)
    expectRejects(() => toWorkItemType('feature'), 'a type this build does not know')
    expectRejects(() => toPriority('urgent'), 'an unknown priority')
  })
})

describe('work item detail edits', () => {
  it('changes only what it is given and advances the revision once', () => {
    const edited = updateWorkItemDetails(item(), { priority: PRIORITY.high }, T2)

    expect(edited.priority).toBe(PRIORITY.high)
    expect(edited.title).toBe('用户使用优惠券')
    expect(edited.revision).toBe(2)
  })

  it('lowercases and deduplicates labels', () => {
    const edited = updateWorkItemDetails(item(), { labels: ['Payments', 'payments', 'UI'] }, T2)

    expect(edited.labels).toEqual(['payments', 'ui'])
    expectRejects(
      () => updateWorkItemDetails(item(), { labels: Array(21).fill('x') as string[] }, T2),
      'more labels than an item may carry',
    )
  })

  it('clears an assignee with an explicit null, not by omission', () => {
    const assigned = updateWorkItemDetails(item(), { assigneeId: REPORTER }, T2)
    const untouched = updateWorkItemDetails(assigned, { priority: PRIORITY.low }, T3)
    const cleared = updateWorkItemDetails(assigned, { assigneeId: null }, T3)

    expect(untouched.assigneeId).toBe(REPORTER)
    expect(cleared.assigneeId).toBeNull()
  })
})

describe('acceptance criteria', () => {
  it('is accepted only once every criterion is met', () => {
    const withCriteria = updateWorkItemDetails(
      item(),
      {
        acceptanceCriteria: [
          { text: '优惠券可叠加', satisfied: false },
          { text: '过期优惠券被拒绝', satisfied: true },
        ],
      },
      T2,
    )
    const first = setAcceptanceCriterionSatisfied(withCriteria, 0, true, T3)

    expect(isWorkItemAccepted(item())).toBe(false)
    expect(isWorkItemAccepted(withCriteria)).toBe(false)
    expect(isWorkItemAccepted(first)).toBe(true)
    expect(first.acceptanceCriteria[1]?.satisfied).toBe(true)
  })

  it('refuses a criterion that is not there and a blank one', () => {
    expectRejects(
      () => setAcceptanceCriterionSatisfied(item(), 0, true, T2),
      'toggling a criterion on an item that has none',
    )
    expectRejects(
      () =>
        updateWorkItemDetails(
          item(),
          { acceptanceCriteria: [{ text: ' ', satisfied: false }] },
          T2,
        ),
      'a blank criterion',
    )
  })
})

describe('sprint membership and board moves', () => {
  it('enters a sprint as todo and returns to the backlog on removal', () => {
    const planned = inSprint()
    const returned = removeWorkItemFromSprint(planned, T3)

    expect(planned.status).toBe(WORK_ITEM_STATUS.todo)
    expect(planned.sprintId).toBe(SPRINT)
    expect(returned.status).toBe(WORK_ITEM_STATUS.backlog)
    expect(returned.sprintId).toBeNull()
  })

  it('keeps the column an item is already in when it moves between sprints', () => {
    const started = moveWorkItemStatus(inSprint(), WORK_ITEM_STATUS.inProgress, T3)
    const carried = assignWorkItemToSprint(started, NEXT_SPRINT, T4)

    expect(carried.sprintId).toBe(NEXT_SPRINT)
    expect(carried.status).toBe(WORK_ITEM_STATUS.inProgress)
  })

  it('refuses a board move for an item that is in no sprint', () => {
    expectRejects(
      () => moveWorkItemStatus(item(), WORK_ITEM_STATUS.inProgress, T2),
      'moving a backlog item across the board',
    )
    expectRejects(() => removeWorkItemFromSprint(item(), T2), 'removing an item from no sprint')
  })

  // Reaching the backlog has to go through the removal, otherwise an item
  // could sit in the backlog while still pointing at a sprint.
  it('refuses to reach the backlog as a status move', () => {
    expectRejects(
      () => moveWorkItemStatus(inSprint(), WORK_ITEM_STATUS.backlog, T3),
      'moving to the backlog as a status change',
    )
  })

  it('refuses to take a finished item out of the sprint that delivered it', () => {
    const finished = moveWorkItemStatus(inSprint(), WORK_ITEM_STATUS.done, T3)

    expect(isWorkItemFinished(finished)).toBe(true)
    expectRejects(() => removeWorkItemFromSprint(finished, T4), 'unplanning a finished item')
  })

  it('refuses a move that changes nothing', () => {
    const planned = inSprint()

    expectRejects(
      () => moveWorkItemStatus(planned, WORK_ITEM_STATUS.todo, T3),
      'moving to the column it is in',
    )
    expectRejects(
      () => assignWorkItemToSprint(planned, SPRINT, T3),
      'replanning into the same sprint',
    )
    expectRejects(() => moveWorkItemRank(planned, planned.rank, T3), 'a rank that is unchanged')
  })

  it('reorders by taking a new rank', () => {
    const planned = inSprint()
    const moved = moveWorkItemRank(planned, rankBetween(null, planned.rank), T3)

    expect(moved.rank < planned.rank).toBe(true)
    expect(moved.revision).toBe(3)
  })
})

describe('blocking', () => {
  it('always carries a reason and clears as a separate act', () => {
    const blocked = blockWorkItem(item(), '  等待支付网关  ', T2)
    const cleared = unblockWorkItem(blocked, T3)

    expect(blocked.blockedReason).toBe('等待支付网关')
    expect(isWorkItemBlocked(blocked)).toBe(true)
    expect(cleared.blockedReason).toBeNull()
    expect(isWorkItemBlocked(cleared)).toBe(false)
  })

  it('refuses a blank reason, a repeated reason and clearing what is not blocked', () => {
    const blocked = blockWorkItem(item(), '等待支付网关', T2)

    expectRejects(() => blockWorkItem(item(), '   ', T2), 'a block with no reason')
    expectRejects(
      () => blockWorkItem(blocked, '等待支付网关', T3),
      'reblocking for the same reason',
    )
    expectRejects(() => unblockWorkItem(item(), T2), 'unblocking an item that is not blocked')
    expect(blockWorkItem(blocked, '等待法务确认', T3).blockedReason).toBe('等待法务确认')
  })
})
