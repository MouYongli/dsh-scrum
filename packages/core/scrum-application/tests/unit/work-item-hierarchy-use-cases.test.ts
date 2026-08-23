import { describe, expect, it } from 'vitest'
import {
  ERROR_CODE,
  WORK_ITEM_CATEGORY,
  WORK_ITEM_RESOLUTION,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  bugDetails,
  toTimestamp,
  toWorkItemId,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'
import {
  createSprint,
  listWorkItems,
  moveWorkItemStatus,
  planSprint,
  resolveWorkItem,
  setWorkItemParent,
  updateWorkItem,
  type StoredProject,
  type WorkItemFilter,
} from '@dsh-scrum/scrum-application'
import { actor, dependencies, type TestDependencies } from '../support/fakes.js'
import { item, project } from '../support/project.js'

async function caught(run: Promise<unknown>): Promise<{ code?: string }> {
  return (await run.catch((error: unknown) => error)) as { code?: string }
}

describe('creating an item inside the hierarchy', () => {
  it('creates a subtask under a level 2 item', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const story = await item(deps, stored, { title: 'story' })

    const subtask = await item(deps, stored, {
      title: 'subtask',
      type: WORK_ITEM_TYPE.subtask,
      parentId: story.id,
    })

    expect(subtask.parentId).toBe(story.id)
    expect(subtask.level).toBe(3)
  })

  it('refuses a parent that is not one level above, and one that is not there', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const peer = await item(deps, stored, { title: 'peer' })

    // The domain settles that a subtask needs a parent; whether the named one
    // can hold it needs the parent itself, which only this layer can read.
    expect(
      (
        await caught(
          item(deps, stored, { title: 'x', type: WORK_ITEM_TYPE.story, parentId: peer.id }),
        )
      ).code,
    ).toBe(ERROR_CODE.validation)
    expect(
      (
        await caught(
          item(deps, stored, {
            title: 'x',
            type: WORK_ITEM_TYPE.subtask,
            parentId: toWorkItemId('SCR-99'),
          }),
        )
      ).code,
    ).toBe(ERROR_CODE.validation)
  })

  it('creates an item with a category and the details its type carries', async () => {
    const deps = dependencies()
    const stored = await project(deps)

    const bug = await item(deps, stored, {
      title: '保存后页面白屏',
      type: WORK_ITEM_TYPE.bug,
      category: WORK_ITEM_CATEGORY.defect,
      typeDetails: { type: WORK_ITEM_TYPE.bug, severity: 'blocker', isRegression: true },
    })

    expect(bug.category).toBe(WORK_ITEM_CATEGORY.defect)
    expect(bugDetails(bug)?.severity).toBe('blocker')
    expect(bugDetails(bug)?.isRegression).toBe(true)
  })

  it('refuses details describing a type other than the one being created', async () => {
    const deps = dependencies()
    const stored = await project(deps)

    const error = await caught(
      item(deps, stored, {
        title: 'x',
        type: WORK_ITEM_TYPE.epic,
        typeDetails: { type: WORK_ITEM_TYPE.bug, severity: 'blocker' },
      }),
    )

    expect(error.code).toBe(ERROR_CODE.validation)
  })
})

describe('changing a type across levels', () => {
  it('refuses while a parent still hangs above the item', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const epic = await item(deps, stored, { title: 'epic', type: WORK_ITEM_TYPE.epic })
    const story = await item(deps, stored, { title: 'story' })
    const linked = await setWorkItemParent(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: story.id,
        expectedRevision: story.revision,
        parentId: epic.id,
      },
    })

    const error = await caught(
      updateWorkItem(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          workItemId: linked.id,
          expectedRevision: linked.revision,
          changes: { type: WORK_ITEM_TYPE.epic },
        },
      }),
    )

    expect(error.code).toBe(ERROR_CODE.validation)
  })

  it('takes a change that stays on one level', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const story = await item(deps, stored, { title: 'story' })

    const changed = await updateWorkItem(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: story.id,
        expectedRevision: story.revision,
        changes: { type: WORK_ITEM_TYPE.bug },
      },
    })

    expect(changed.type).toBe(WORK_ITEM_TYPE.bug)
    expect(changed.level).toBe(2)
    // The details are rebuilt for the new type rather than carried across.
    expect(bugDetails(changed)).not.toBeNull()
  })
})

async function plannedStory(deps: TestDependencies, stored: StoredProject): Promise<WorkItem> {
  const story = await item(deps, stored, { title: 'story' })
  const sprint = await createSprint(deps, {
    actor: actor(),
    command: {
      projectId: stored.project.id,
      name: '第一轮',
      startDate: toTimestamp('2026-08-24T09:00:00.000Z'),
      endDate: toTimestamp('2026-09-07T09:00:00.000Z'),
    },
  })
  const [planned] = await planSprint(deps, {
    actor: actor(),
    command: {
      projectId: stored.project.id,
      sprintId: sprint.id,
      items: [{ workItemId: story.id, expectedRevision: story.revision }],
    },
  })
  return planned as WorkItem
}

describe('finishing work', () => {
  it('names how the work ended, and restates it afterwards', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const planned = await plannedStory(deps, stored)

    const finished = await moveWorkItemStatus(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: planned.id,
        expectedRevision: planned.revision,
        status: WORK_ITEM_STATUS.done,
        resolution: WORK_ITEM_RESOLUTION.wontFix,
      },
    })
    const restated = await resolveWorkItem(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: finished.id,
        expectedRevision: finished.revision,
        resolution: WORK_ITEM_RESOLUTION.duplicate,
      },
    })

    expect(finished.resolution).toBe(WORK_ITEM_RESOLUTION.wontFix)
    expect(restated.resolution).toBe(WORK_ITEM_RESOLUTION.duplicate)
    expect(restated.status).toBe(WORK_ITEM_STATUS.done)
  })

  it('moves a subtask on the board of the sprint its parent is in', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const planned = await plannedStory(deps, stored)
    const subtask = await item(deps, stored, {
      title: 'subtask',
      type: WORK_ITEM_TYPE.subtask,
      parentId: planned.id,
    })

    const moved = await moveWorkItemStatus(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: subtask.id,
        expectedRevision: subtask.revision,
        status: WORK_ITEM_STATUS.inProgress,
      },
    })

    // The subtask holds no sprint of its own; the board it moved on is its
    // parent's, and nothing was copied onto the child to say so.
    expect(moved.status).toBe(WORK_ITEM_STATUS.inProgress)
    expect(moved.sprintId).toBeNull()
  })

  it('refuses a subtask whose parent is still in the backlog', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const story = await item(deps, stored, { title: 'story' })
    const subtask = await item(deps, stored, {
      title: 'subtask',
      type: WORK_ITEM_TYPE.subtask,
      parentId: story.id,
    })

    const error = await caught(
      moveWorkItemStatus(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          workItemId: subtask.id,
          expectedRevision: subtask.revision,
          status: WORK_ITEM_STATUS.inProgress,
        },
      }),
    )

    expect(error.code).toBe(ERROR_CODE.validation)
  })
})

describe('narrowing the backlog', () => {
  it('narrows by level, category and outcome', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const epic = await item(deps, stored, { title: 'epic', type: WORK_ITEM_TYPE.epic })
    await item(deps, stored, { title: 'debt', category: WORK_ITEM_CATEGORY.techDebt })
    const list = async (filter: WorkItemFilter) =>
      await listWorkItems(deps, {
        actor: actor(),
        command: { projectId: stored.project.id, filter },
      })

    expect((await list({ levels: [1] })).map((found) => found.id)).toEqual([epic.id])
    expect((await list({ categories: [WORK_ITEM_CATEGORY.techDebt] })).map((f) => f.title)).toEqual(
      ['debt'],
    )
    // Unclassified is not silently swept into any bucket, and nothing is
    // finished yet, so an outcome filter matches nothing at all.
    expect(await list({ categories: [WORK_ITEM_CATEGORY.feature] })).toEqual([])
    expect(await list({ resolutions: [WORK_ITEM_RESOLUTION.done] })).toEqual([])
  })

  it("counts a subtask as being in its parent's sprint", async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const planned = await plannedStory(deps, stored)
    const subtask = await item(deps, stored, {
      title: 'subtask',
      type: WORK_ITEM_TYPE.subtask,
      parentId: planned.id,
    })

    const inSprint = await listWorkItems(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, filter: { sprintId: planned.sprintId } },
    })
    const backlog = await listWorkItems(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, filter: { sprintId: null } },
    })

    expect(inSprint.map((found) => found.id)).toContain(subtask.id)
    expect(backlog.map((found) => found.id)).not.toContain(subtask.id)
  })
})
