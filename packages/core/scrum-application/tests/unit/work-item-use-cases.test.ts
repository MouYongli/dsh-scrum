import { describe, expect, it } from 'vitest'
import {
  PERMISSION,
  PRIORITY,
  PROJECT_ROLE,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  toRevision,
} from '@dsh-scrum/scrum-domain'
import {
  createWorkItem,
  getWorkItem,
  listWorkItems,
  setAcceptanceCriterion,
  updateWorkItem,
} from '@dsh-scrum/scrum-application'
import { ACTOR_ID, OTHER_ID, actor, dependencies } from '../support/fakes.js'
import { item, memberWithRoles, project } from '../support/project.js'

async function caught(run: Promise<unknown>): Promise<{ code?: string; details?: unknown }> {
  return (await run.catch((error: unknown) => error)) as { code?: string; details?: unknown }
}

describe('createWorkItem', () => {
  it('adds an item to the backlog with the actor as its reporter', async () => {
    const deps = dependencies()
    const stored = await project(deps)

    const created = await item(deps, stored)

    expect(created.id).toBe('SCR-1')
    expect(created.status).toBe(WORK_ITEM_STATUS.backlog)
    expect(created.sprintId).toBeNull()
    expect(created.reporterId).toBe(ACTOR_ID)
    expect(deps.activity.events).toMatchObject([
      { action: 'workItem.create', targetType: 'workItem' },
    ])
  })

  it('appends to the end of the backlog by default', async () => {
    const deps = dependencies()
    const stored = await project(deps)

    const first = await item(deps, stored, { title: 'first' })
    const second = await item(deps, stored, { title: 'second' })

    expect(second.rank > first.rank).toBe(true)
  })

  it('lands between the item it was dropped after and whatever followed it', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const first = await item(deps, stored, { title: 'first' })
    const last = await item(deps, stored, { title: 'last' })

    const middle = await item(deps, stored, { title: 'middle', after: first.rank })

    expect(middle.rank > first.rank).toBe(true)
    expect(middle.rank < last.rank).toBe(true)
  })

  it('asks for another identifier when the first one was taken', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    await item(deps, stored, { title: 'first' })
    deps.workItems.collideOnce = true

    const created = await item(deps, stored, { title: 'second' })

    expect(created.id).toBe('SCR-2')
    expect(deps.workItems.items.size).toBe(2)
  })

  it('refuses a role that may not write work items', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    memberWithRoles(deps, stored, OTHER_ID, [PROJECT_ROLE.stakeholder])

    const error = await caught(
      createWorkItem(deps, {
        actor: actor({ identityId: OTHER_ID }),
        command: {
          projectId: stored.project.id,
          type: WORK_ITEM_TYPE.story,
          title: 'use a coupon',
        },
      }),
    )

    expect(error.code).toBe('FORBIDDEN')
    expect(deps.workItems.items.size).toBe(0)
  })
})

describe('listWorkItems', () => {
  it('returns the backlog in rank order and narrows by filter', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    await item(deps, stored, { title: 'low', priority: PRIORITY.low })
    await item(deps, stored, { title: 'high', priority: PRIORITY.high })

    const all = await listWorkItems(deps, {
      actor: actor(),
      command: { projectId: stored.project.id },
    })
    const high = await listWorkItems(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, filter: { priorities: [PRIORITY.high] } },
    })

    expect(all.map((found) => found.title)).toEqual(['low', 'high'])
    expect(high.map((found) => found.title)).toEqual(['high'])
  })

  it('describes the backlog as the items with no sprint', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    await item(deps, stored)

    const backlog = await listWorkItems(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, filter: { sprintId: null } },
    })

    expect(backlog).toHaveLength(1)
  })

  it('matches a search against the title and the description', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    await item(deps, stored, { title: 'checkout flow', description: 'nothing here' })
    await item(deps, stored, { title: 'nothing here', description: 'the CHECKOUT page' })
    await item(deps, stored, { title: 'unrelated', description: '' })

    const found = await listWorkItems(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, filter: { text: ' Checkout ' } },
    })

    expect(found).toHaveLength(2)
  })
})

describe('getWorkItem', () => {
  it('reports an item that is not there', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const created = await item(deps, stored)
    deps.workItems.items.clear()

    const error = await caught(
      getWorkItem(deps, {
        actor: actor(),
        command: { projectId: stored.project.id, workItemId: created.id },
      }),
    )

    expect(error.code).toBe('NOT_FOUND')
  })

  it('does not hand over an item from another project', async () => {
    const deps = dependencies()
    const first = await project(deps)
    const created = await item(deps, first)
    const second = await project(deps)

    const error = await caught(
      getWorkItem(deps, {
        actor: actor(),
        command: { projectId: second.project.id, workItemId: created.id },
      }),
    )

    expect(error.code).toBe('NOT_FOUND')
  })
})

describe('updateWorkItem', () => {
  it('edits the detail fields and advances the revision by one', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const created = await item(deps, stored)

    const updated = await updateWorkItem(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: created.id,
        expectedRevision: created.revision,
        changes: { title: 'use two coupons' },
      },
    })

    expect(updated.title).toBe('use two coupons')
    expect(updated.revision).toBe(created.revision + 1)
  })

  it('names the entity and both revisions when the caller is out of date', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const created = await item(deps, stored)

    const error = await caught(
      updateWorkItem(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          workItemId: created.id,
          expectedRevision: toRevision(created.revision + 5),
          changes: { title: 'stale' },
        },
      }),
    )

    expect(error.code).toBe('CONFLICT')
    expect(error.details).toMatchObject({
      entityType: 'workItem',
      entityId: created.id,
      expectedRevision: created.revision + 5,
      actualRevision: created.revision,
    })
    expect(deps.workItems.items.get(created.id)?.title).toBe('use a coupon')
  })

  it('needs the estimate permission to change an estimate', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const created = await item(deps, stored)
    memberWithRoles(deps, stored, OTHER_ID, [PROJECT_ROLE.developer])

    const request = {
      actor: actor({ identityId: OTHER_ID }),
      command: {
        projectId: stored.project.id,
        workItemId: created.id,
        expectedRevision: created.revision,
        changes: { estimate: 5 },
      },
    }
    const allowed = await updateWorkItem(deps, request)

    expect(allowed.estimate).toBe(5)
  })

  it('refuses an estimate from a role the project has not enabled it for', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const created = await item(deps, stored)
    // Administrators may write work items, but estimating is a configurable
    // cell that no project has turned on.
    memberWithRoles(deps, stored, OTHER_ID, [PROJECT_ROLE.administrator])

    const error = await caught(
      updateWorkItem(deps, {
        actor: actor({ identityId: OTHER_ID }),
        command: {
          projectId: stored.project.id,
          workItemId: created.id,
          expectedRevision: created.revision,
          changes: { title: 'renamed', estimate: 5 },
        },
      }),
    )

    expect(error.code).toBe('FORBIDDEN')
    expect(error.details).toMatchObject({ permission: PERMISSION.workItemEstimate })
    // The title must not have gone through either: the call is one decision.
    expect(deps.workItems.items.get(created.id)?.title).toBe('use a coupon')
  })
})

describe('setAcceptanceCriterion', () => {
  it('ticks one criterion off by position', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const created = await item(deps, stored, {
      acceptanceCriteria: [
        { text: 'the coupon applies', satisfied: false },
        { text: 'the total updates', satisfied: false },
      ],
    })

    const updated = await setAcceptanceCriterion(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: created.id,
        expectedRevision: created.revision,
        index: 1,
        satisfied: true,
      },
    })

    expect(updated.acceptanceCriteria.map((criterion) => criterion.satisfied)).toEqual([
      false,
      true,
    ])
    expect(deps.activity.events.at(-1)).toMatchObject({ action: 'workItem.accept' })
  })
})
