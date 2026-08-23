import { describe, expect, it } from 'vitest'
import {
  ERROR_CODE,
  WORK_ITEM_CATEGORY,
  WORK_ITEM_TYPE,
  bugDetails,
  toWorkItemId,
} from '@dsh-scrum/scrum-domain'
import { setWorkItemParent, updateWorkItem } from '@dsh-scrum/scrum-application'
import { actor, dependencies } from '../support/fakes.js'
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
