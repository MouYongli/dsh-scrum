import { describe, expect, it } from 'vitest'
import {
  ERROR_CODE,
  WORK_ITEM_LEVEL,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  assignWorkItemToSprint,
  createWorkItem,
  isScrumError,
  isWorkItemPlannable,
  moveWorkItemStatus,
  rankBetween,
  removeWorkItemFromSprint,
  toIdentityId,
  toProjectId,
  toSprintId,
  toTimestamp,
  toWorkItemId,
  updateWorkItemDetails,
  workItemLevel,
  type WorkItem,
  type WorkItemType,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const PROJECT = toProjectId(`prj_${ULID}`)
const REPORTER = toIdentityId(`idt_${ULID}`)
const SPRINT = toSprintId('sprint-1')
const T1 = toTimestamp('2026-08-20T10:00:00Z')
const T2 = toTimestamp('2026-08-20T11:00:00Z')

function expectRejects(run: () => unknown, what: string): void {
  let caught: unknown
  try {
    run()
  } catch (error) {
    caught = error
  }
  expect(isScrumError(caught) && caught.code, `expected ${what} to be rejected`).toBe(
    ERROR_CODE.validation,
  )
}

function item(type: WorkItemType, estimate?: number): WorkItem {
  return createWorkItem({
    id: toWorkItemId('SCR-1'),
    projectId: PROJECT,
    type,
    title: '一条工作项',
    reporterId: REPORTER,
    rank: rankBetween(null, null),
    estimate,
    now: T1,
  })
}

describe('work item levels', () => {
  it('gives every type one level and stamps it on creation', () => {
    expect(WORK_ITEM_LEVEL).toEqual({ epic: 1, story: 2, task: 2, bug: 2, subtask: 3 })
    expect(item(WORK_ITEM_TYPE.epic).level).toBe(1)
    expect(item(WORK_ITEM_TYPE.bug).level).toBe(2)
    expect(item(WORK_ITEM_TYPE.subtask).level).toBe(3)
  })

  it('treats the three level 2 types as peers a sprint can hold', () => {
    expect(isWorkItemPlannable(item(WORK_ITEM_TYPE.story))).toBe(true)
    expect(isWorkItemPlannable(item(WORK_ITEM_TYPE.task))).toBe(true)
    expect(isWorkItemPlannable(item(WORK_ITEM_TYPE.bug))).toBe(true)
    expect(isWorkItemPlannable(item(WORK_ITEM_TYPE.epic))).toBe(false)
    expect(isWorkItemPlannable(item(WORK_ITEM_TYPE.subtask))).toBe(false)
  })

  it('recomputes the level when the type changes', () => {
    const changed = updateWorkItemDetails(
      item(WORK_ITEM_TYPE.story),
      {
        type: WORK_ITEM_TYPE.subtask,
      },
      T2,
    )

    expect(changed.type).toBe(WORK_ITEM_TYPE.subtask)
    expect(changed.level).toBe(workItemLevel(WORK_ITEM_TYPE.subtask))
  })
})

describe('estimates outside level 2', () => {
  it('refuses one on an epic and on a subtask', () => {
    expect(item(WORK_ITEM_TYPE.story, 5).estimate).toBe(5)
    expectRejects(() => item(WORK_ITEM_TYPE.epic, 5), 'an estimated epic')
    expectRejects(() => item(WORK_ITEM_TYPE.subtask, 5), 'an estimated subtask')
  })

  it('refuses a type change that would strand an estimate, and takes one that clears it', () => {
    const sized = item(WORK_ITEM_TYPE.story, 5)

    expectRejects(
      () => updateWorkItemDetails(sized, { type: WORK_ITEM_TYPE.epic }, T2),
      'promoting a sized story to an epic',
    )
    expect(
      updateWorkItemDetails(sized, { type: WORK_ITEM_TYPE.epic, estimate: null }, T2).estimate,
    ).toBeNull()
  })
})

describe('sprint membership outside level 2', () => {
  it('refuses to plan an epic or a subtask into a sprint', () => {
    expectRejects(() => assignWorkItemToSprint(item(WORK_ITEM_TYPE.epic), SPRINT, T2), 'an epic')
    expectRejects(
      () => assignWorkItemToSprint(item(WORK_ITEM_TYPE.subtask), SPRINT, T2),
      'a subtask',
    )
  })

  it('refuses to remove them from one', () => {
    expectRejects(() => removeWorkItemFromSprint(item(WORK_ITEM_TYPE.epic), T2), 'an epic')
    expectRejects(() => removeWorkItemFromSprint(item(WORK_ITEM_TYPE.subtask), T2), 'a subtask')
  })
})

describe('board moves by level', () => {
  it('moves a subtask on the sprint its parent is in', () => {
    const moved = moveWorkItemStatus(
      item(WORK_ITEM_TYPE.subtask),
      WORK_ITEM_STATUS.inProgress,
      T2,
      SPRINT,
    )

    expect(moved.status).toBe(WORK_ITEM_STATUS.inProgress)
    expect(moved.sprintId).toBeNull()
  })

  it('refuses a subtask whose parent is in no sprint', () => {
    expectRejects(
      () => moveWorkItemStatus(item(WORK_ITEM_TYPE.subtask), WORK_ITEM_STATUS.inProgress, T2, null),
      'a subtask under a backlog parent',
    )
  })

  it('refuses to advance an epic, which reports its children instead', () => {
    expectRejects(
      () => moveWorkItemStatus(item(WORK_ITEM_TYPE.epic), WORK_ITEM_STATUS.inProgress, T2, SPRINT),
      'an epic moved by hand',
    )
  })
})
