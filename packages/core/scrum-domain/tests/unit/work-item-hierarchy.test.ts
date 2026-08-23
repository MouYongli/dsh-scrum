import { describe, expect, it } from 'vitest'
import {
  ERROR_CODE,
  WORK_ITEM_CATEGORY,
  WORK_ITEM_LEVEL,
  WORK_ITEM_RESOLUTION,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  assertWorkItemTypeChange,
  assignWorkItemToSprint,
  createWorkItem,
  setWorkItemParent,
  isScrumError,
  isWorkItemPlannable,
  moveWorkItemStatus,
  rankBetween,
  recommendedTypeFor,
  resolveWorkItem,
  removeWorkItemFromSprint,
  toIdentityId,
  toProjectId,
  toWorkItemCategory,
  toWorkItemResolution,
  toSprintId,
  toTimestamp,
  toWorkItemId,
  updateWorkItemDetails,
  workItemLevel,
  type WorkItem,
  type WorkItemId,
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

const PARENT = toWorkItemId('SCR-9')

/** A subtask is created under something, so one is named for every level 3. */
function item(type: WorkItemType, estimate?: number): WorkItem {
  return createWorkItem({
    id: toWorkItemId('SCR-1'),
    projectId: PROJECT,
    type,
    title: '一条工作项',
    reporterId: REPORTER,
    rank: rankBetween(null, null),
    estimate,
    parentId: type === WORK_ITEM_TYPE.subtask ? PARENT : null,
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
      { type: WORK_ITEM_TYPE.subtask },
      T2,
    )

    expect(changed.type).toBe(WORK_ITEM_TYPE.subtask)
    expect(changed.level).toBe(workItemLevel(WORK_ITEM_TYPE.subtask))
  })

  it('creates a subtask under a parent and refuses one without', () => {
    expect(item(WORK_ITEM_TYPE.subtask).parentId).toBe(PARENT)
    expectRejects(
      () =>
        createWorkItem({
          id: toWorkItemId('SCR-2'),
          projectId: PROJECT,
          type: WORK_ITEM_TYPE.subtask,
          title: '无处安放的子任务',
          reporterId: REPORTER,
          rank: rankBetween(null, null),
          now: T1,
        }),
      'a subtask with nothing above it',
    )
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
      { effectiveSprintId: SPRINT },
    )

    expect(moved.status).toBe(WORK_ITEM_STATUS.inProgress)
    expect(moved.sprintId).toBeNull()
  })

  it('refuses a subtask whose parent is in no sprint', () => {
    expectRejects(
      () =>
        moveWorkItemStatus(item(WORK_ITEM_TYPE.subtask), WORK_ITEM_STATUS.inProgress, T2, {
          effectiveSprintId: null,
        }),
      'a subtask under a backlog parent',
    )
  })

  it('refuses to advance an epic, which reports its children instead', () => {
    expectRejects(
      () =>
        moveWorkItemStatus(item(WORK_ITEM_TYPE.epic), WORK_ITEM_STATUS.inProgress, T2, {
          effectiveSprintId: SPRINT,
        }),
      'an epic moved by hand',
    )
  })
})

function named(key: string, type: WorkItemType, parentId: WorkItemId | null = null): WorkItem {
  return createWorkItem({
    id: toWorkItemId(key),
    projectId: PROJECT,
    type,
    title: key,
    reporterId: REPORTER,
    rank: rankBetween(null, null),
    parentId,
    now: T1,
  })
}

function lookup(...items: readonly WorkItem[]): ReadonlyMap<WorkItemId, WorkItem> {
  return new Map(items.map((entry) => [entry.id, entry]))
}

describe('parents one level up', () => {
  it('links a story under an epic and a subtask under a story', () => {
    const epic = named('SCR-1', WORK_ITEM_TYPE.epic)
    const story = named('SCR-2', WORK_ITEM_TYPE.story)
    const under = setWorkItemParent(story, epic.id, lookup(epic, story), T2)
    const subtask = named('SCR-3', WORK_ITEM_TYPE.subtask, under.id)

    expect(under.parentId).toBe(epic.id)
    expect(subtask.parentId).toBe(under.id)
  })

  it('refuses a parent on the same level and one two levels up', () => {
    const epic = named('SCR-1', WORK_ITEM_TYPE.epic)
    const story = named('SCR-2', WORK_ITEM_TYPE.story)
    const peer = named('SCR-3', WORK_ITEM_TYPE.task)
    const subtask = named('SCR-4', WORK_ITEM_TYPE.subtask, story.id)

    expectRejects(
      () => setWorkItemParent(story, peer.id, lookup(peer, story), T2),
      'a story under a task',
    )
    expectRejects(
      () => setWorkItemParent(subtask, epic.id, lookup(epic, subtask), T2),
      'a subtask straight under an epic',
    )
  })

  it('refuses to leave a subtask with nothing above it', () => {
    const story = named('SCR-1', WORK_ITEM_TYPE.story)
    const subtask = named('SCR-2', WORK_ITEM_TYPE.subtask, story.id)

    expectRejects(
      () => setWorkItemParent(subtask, null, lookup(story, subtask), T2),
      'detaching a subtask',
    )
  })
})

describe('type changes across levels', () => {
  it('lets a story become a task or a bug, whatever hangs off it', () => {
    const epic = named('SCR-1', WORK_ITEM_TYPE.epic)
    const story = named('SCR-2', WORK_ITEM_TYPE.story)
    const under = setWorkItemParent(story, epic.id, lookup(epic, story), T2)
    const subtask = named('SCR-3', WORK_ITEM_TYPE.subtask, under.id)

    expect(() =>
      assertWorkItemTypeChange(under, WORK_ITEM_TYPE.bug, [epic, under, subtask]),
    ).not.toThrow()
  })

  it('refuses to promote a story that still sits under an epic', () => {
    const epic = named('SCR-1', WORK_ITEM_TYPE.epic)
    const story = named('SCR-2', WORK_ITEM_TYPE.story)
    const under = setWorkItemParent(story, epic.id, lookup(epic, story), T2)

    expectRejects(
      () => assertWorkItemTypeChange(under, WORK_ITEM_TYPE.epic, [epic, under]),
      'an epic under an epic',
    )
  })

  it('refuses to promote a story that still has subtasks under it', () => {
    const story = named('SCR-2', WORK_ITEM_TYPE.story)
    const subtask = named('SCR-3', WORK_ITEM_TYPE.subtask, story.id)

    expectRejects(
      () => assertWorkItemTypeChange(story, WORK_ITEM_TYPE.epic, [story, subtask]),
      'an epic with subtasks directly under it',
    )
  })

  it('refuses to demote an unparented story to a subtask', () => {
    const story = named('SCR-2', WORK_ITEM_TYPE.story)

    expectRejects(
      () => assertWorkItemTypeChange(story, WORK_ITEM_TYPE.subtask, [story]),
      'a subtask with nothing above it',
    )
  })
})

describe('the work category', () => {
  it('suggests a type for every category without insisting on it', () => {
    expect(recommendedTypeFor(WORK_ITEM_CATEGORY.feature)).toBe(WORK_ITEM_TYPE.story)
    expect(recommendedTypeFor(WORK_ITEM_CATEGORY.nfrVisible)).toBe(WORK_ITEM_TYPE.story)
    expect(recommendedTypeFor(WORK_ITEM_CATEGORY.techDebt)).toBe(WORK_ITEM_TYPE.task)
    expect(recommendedTypeFor(WORK_ITEM_CATEGORY.spike)).toBe(WORK_ITEM_TYPE.task)
    expect(recommendedTypeFor(WORK_ITEM_CATEGORY.defect)).toBe(WORK_ITEM_TYPE.bug)

    // The suggestion is not a constraint: a team that files a spike as a story
    // is describing its own convention, not breaking a rule.
    const filed = updateWorkItemDetails(
      named('SCR-1', WORK_ITEM_TYPE.story),
      { category: WORK_ITEM_CATEGORY.spike },
      T2,
    )
    expect(filed.category).toBe(WORK_ITEM_CATEGORY.spike)
  })

  it('leaves an item nobody classified as unclassified, and takes one back', () => {
    const created = named('SCR-1', WORK_ITEM_TYPE.task)
    const classified = updateWorkItemDetails(created, { category: WORK_ITEM_CATEGORY.techDebt }, T2)

    expect(created.category).toBeNull()
    expect(classified.category).toBe(WORK_ITEM_CATEGORY.techDebt)
    expect(updateWorkItemDetails(classified, { category: null }, T2).category).toBeNull()
    // An edit that says nothing about the category leaves it where it was.
    expect(updateWorkItemDetails(classified, { title: '换个标题' }, T2).category).toBe(
      WORK_ITEM_CATEGORY.techDebt,
    )
  })

  it('accepts only the published category spellings', () => {
    expect(toWorkItemCategory('nfr_visible')).toBe(WORK_ITEM_CATEGORY.nfrVisible)
    expectRejects(() => toWorkItemCategory('chore'), 'a category this build does not know')
  })
})

describe('how work ends', () => {
  function inSprint(): WorkItem {
    return assignWorkItemToSprint(named('SCR-1', WORK_ITEM_TYPE.story), SPRINT, T2)
  }

  it('carries no outcome until it is finished, and defaults to done when it is', () => {
    const planned = inSprint()
    const working = moveWorkItemStatus(planned, WORK_ITEM_STATUS.inProgress, T2)
    const finished = moveWorkItemStatus(working, WORK_ITEM_STATUS.done, T2)

    expect(planned.resolution).toBeNull()
    expect(working.resolution).toBeNull()
    expect(finished.resolution).toBe(WORK_ITEM_RESOLUTION.done)
  })

  it('takes the outcome the mover named', () => {
    const finished = moveWorkItemStatus(inSprint(), WORK_ITEM_STATUS.done, T2, {
      resolution: WORK_ITEM_RESOLUTION.wontFix,
    })

    expect(finished.status).toBe(WORK_ITEM_STATUS.done)
    expect(finished.resolution).toBe(WORK_ITEM_RESOLUTION.wontFix)
  })

  it('refuses an outcome aimed at any other column', () => {
    expectRejects(
      () =>
        moveWorkItemStatus(inSprint(), WORK_ITEM_STATUS.review, T2, {
          resolution: WORK_ITEM_RESOLUTION.duplicate,
        }),
      'an outcome on an unfinished item',
    )
  })

  it('clears the outcome when the work is picked back up', () => {
    const finished = moveWorkItemStatus(inSprint(), WORK_ITEM_STATUS.done, T2, {
      resolution: WORK_ITEM_RESOLUTION.cannotReproduce,
    })

    expect(moveWorkItemStatus(finished, WORK_ITEM_STATUS.inProgress, T2).resolution).toBeNull()
  })

  it('restates a finished outcome without moving the item again', () => {
    const finished = moveWorkItemStatus(inSprint(), WORK_ITEM_STATUS.done, T2)
    const restated = resolveWorkItem(finished, WORK_ITEM_RESOLUTION.duplicate, T2)

    expect(restated.resolution).toBe(WORK_ITEM_RESOLUTION.duplicate)
    expect(restated.status).toBe(WORK_ITEM_STATUS.done)
    expect(restated.revision).toBe(finished.revision + 1)
    expectRejects(
      () => resolveWorkItem(restated, WORK_ITEM_RESOLUTION.duplicate, T2),
      'restating the outcome it already has',
    )
    expectRejects(
      () => resolveWorkItem(inSprint(), WORK_ITEM_RESOLUTION.wontFix, T2),
      'an outcome on work still in progress',
    )
  })

  it('accepts only the published outcome spellings', () => {
    expect(toWorkItemResolution('wont_fix')).toBe(WORK_ITEM_RESOLUTION.wontFix)
    expectRejects(() => toWorkItemResolution('fixed'), 'an outcome this build does not know')
  })
})
