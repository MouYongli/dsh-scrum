import { describe, expect, it } from 'vitest'
import { PERMISSION, PERMISSIONS, WORK_ITEM_STATUS, WORK_ITEM_TYPE } from '@dsh-scrum/scrum-domain'
import {
  READ_TOOL,
  WRITE_TOOL,
  WRITE_TOOL_NAMES,
  createReadTools,
  createWriteTools,
  registerScrumTools,
  visibleTools,
} from '@dsh-scrum/scrum-agent-tools'
import { IDENTITY, SESSION_ID, boundHost, store, type Store } from '../support/host.js'

const RUN = {} as never

type Api = Parameters<typeof createWriteTools>[0]

async function call(api: Api, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const tool = [...createReadTools(api), ...createWriteTools(api)].find(
    (definition) => definition.name === name,
  ) as { execute(args: unknown, exec: never): Promise<unknown> }
  return await tool.execute(args, RUN)
}

async function writing(state: Store): Promise<Api> {
  return (await boundHost(state)).api
}

async function seedItem(api: Api): Promise<{ id: string; revision: number }> {
  const created = (await call(api, WRITE_TOOL.createWorkItem, {
    type: WORK_ITEM_TYPE.story,
    title: 'use a coupon',
  })) as { ok: true; result: { id: string; revision: number } }
  return created.result
}

describe('what the current user sees', () => {
  it('shows a reader no writing tools at all', () => {
    const visible = new Set<string>(
      visibleTools(new Set([PERMISSION.projectView, PERMISSION.backlogView])),
    )

    for (const name of WRITE_TOOL_NAMES) {
      expect(visible.has(name)).toBe(false)
    }
  })

  it('shows an owner both halves', () => {
    const visible = new Set<string>(visibleTools(new Set(PERMISSIONS)))

    for (const name of WRITE_TOOL_NAMES) {
      expect(visible.has(name)).toBe(true)
    }
    expect(visible.has(READ_TOOL.getProject)).toBe(true)
  })

  it('registers only the readable half for a reader', async () => {
    const state = store()
    const { api } = await boundHost(state)
    const registered: string[] = []
    const registry = {
      register: (definition: { name: string }) => {
        registered.push(definition.name)
        return () => undefined
      },
    }

    registerScrumTools(registry, api, new Set([PERMISSION.projectView, PERMISSION.backlogView]))

    expect(registered.some((name) => (WRITE_TOOL_NAMES as readonly string[]).includes(name))).toBe(
      false,
    )
  })
})

describe('the writing tools', () => {
  it('create a work item and report the card back', async () => {
    const state = store()
    const api = await writing(state)

    const created = (await call(api, WRITE_TOOL.createWorkItem, {
      type: WORK_ITEM_TYPE.bug,
      title: 'the coupon does not apply',
      priority: 'high',
    })) as { ok: true; result: Record<string, unknown> }

    expect(created.ok).toBe(true)
    expect(created.result['title']).toBe('the coupon does not apply')
    expect(created.result['status']).toBe(WORK_ITEM_STATUS.backlog)
  })

  it('update an item at the revision the caller read', async () => {
    const state = store()
    const api = await writing(state)
    const item = await seedItem(api)

    const updated = (await call(api, WRITE_TOOL.updateWorkItem, {
      workItemId: item.id,
      expectedRevision: item.revision,
      title: 'use two coupons',
    })) as { ok: true; result: Record<string, unknown> }

    expect(updated.result['title']).toBe('use two coupons')
    expect(updated.result['revision']).toBe(item.revision + 1)
  })

  it('block and unblock an item', async () => {
    const state = store()
    const api = await writing(state)
    const item = await seedItem(api)

    const blocked = (await call(api, WRITE_TOOL.blockWorkItem, {
      workItemId: item.id,
      expectedRevision: item.revision,
      reason: 'waiting on the payment provider',
    })) as { ok: true; result: Record<string, unknown> }
    const cleared = (await call(api, WRITE_TOOL.blockWorkItem, {
      workItemId: item.id,
      expectedRevision: blocked.result['revision'],
    })) as { ok: true; result: Record<string, unknown> }

    expect(blocked.result['blockedReason']).toBe('waiting on the payment provider')
    expect(cleared.result['blockedReason']).toBeNull()
  })

  it('carry the optional fields through when they are given', async () => {
    const state = store()
    const api = await writing(state)

    const created = (await call(api, WRITE_TOOL.createWorkItem, {
      type: WORK_ITEM_TYPE.story,
      title: 'use a coupon',
      description: 'the shopper enters a code',
    })) as { ok: true; result: { id: string; revision: number } }
    const estimated = (await call(api, WRITE_TOOL.updateWorkItem, {
      workItemId: created.result.id,
      expectedRevision: created.result.revision,
      description: 'the shopper enters a valid code',
      estimate: 3,
    })) as { ok: true; result: Record<string, unknown> }

    expect(state.workItems.get(created.result.id as never)?.description).toBe(
      'the shopper enters a valid code',
    )
    expect(estimated.result['estimate']).toBe(3)
  })

  it('move an item behind another by rank', async () => {
    const state = store()
    const api = await writing(state)
    const first = await seedItem(api)
    const second = (await call(api, WRITE_TOOL.createWorkItem, {
      type: WORK_ITEM_TYPE.task,
      title: 'second',
    })) as { ok: true; result: { id: string; revision: number } }
    const anchor = state.workItems.get(second.result.id as never)!

    const moved = (await call(api, WRITE_TOOL.moveWorkItem, {
      workItemId: first.id,
      expectedRevision: first.revision,
      afterRank: anchor.rank,
    })) as { ok: true; result: Record<string, unknown> }

    expect(moved.ok).toBe(true)
    expect(String(state.workItems.get(first.id as never)?.rank) > String(anchor.rank)).toBe(true)
  })

  it('refuse to delete an item something still points at', async () => {
    const state = store()
    const api = await writing(state)
    const item = await seedItem(api)
    const stored = state.workItems.get(item.id as never)!
    const child = { ...stored, id: 'SCR-99' as never, parentId: stored.id }
    state.workItems.set(child.id, child)

    const error = await call(api, WRITE_TOOL.deleteWorkItem, {
      workItemId: item.id,
      expectedRevision: item.revision,
    }).catch((caught: unknown) => caught)

    expect((error as { code?: string }).code).toBe('VALIDATION')
    expect(state.workItems.has(item.id as never)).toBe(true)
  })
})

describe('a revision that has moved on', () => {
  it('returns a structured conflict instead of overwriting', async () => {
    const state = store()
    const api = await writing(state)
    const item = await seedItem(api)
    await call(api, WRITE_TOOL.updateWorkItem, {
      workItemId: item.id,
      expectedRevision: item.revision,
      title: 'somebody else got there first',
    })

    const outcome = (await call(api, WRITE_TOOL.updateWorkItem, {
      workItemId: item.id,
      expectedRevision: item.revision,
      title: 'my change',
    })) as Record<string, unknown>

    expect(outcome['ok']).toBe(false)
    expect(outcome['reason']).toBe('conflict')
    expect(outcome['expectedRevision']).toBe(item.revision)
    expect(outcome['currentRevision']).toBe(item.revision + 1)
    // The tool did not retry, so the earlier change still stands.
    expect(state.workItems.get(item.id as never)?.title).toBe('somebody else got there first')
  })
})

describe('provenance', () => {
  it('records the actor, the source and the session behind an agent write', async () => {
    const state = store()
    const api = await writing(state)

    await call(api, WRITE_TOOL.createWorkItem, {
      type: WORK_ITEM_TYPE.story,
      title: 'use a coupon',
    })

    expect(state.activity).toMatchObject([
      { action: 'workItem.create', actorId: IDENTITY, sessionId: SESSION_ID },
    ])
  })

  it('acts as the user the host resolved, whatever the arguments say', async () => {
    const state = store()
    const api = await writing(state)

    await call(api, WRITE_TOOL.createWorkItem, {
      type: WORK_ITEM_TYPE.story,
      title: 'use a coupon',
      actorId: 'idt_01K00000000000000000000099',
      projectId: 'prj_01K00000000000000000000099',
    })

    expect(new Set(state.actors)).toEqual(new Set([IDENTITY]))
    expect(state.activity.every((event) => event.actorId === IDENTITY)).toBe(true)
    expect(state.projects.size).toBe(1)
  })

  it('refuses every write after the current user loses membership', async () => {
    const state = store()
    const { api } = await boundHost(state)
    state.owners.clear()

    const error = await call(api, WRITE_TOOL.createWorkItem, {
      type: WORK_ITEM_TYPE.story,
      title: 'use a coupon',
    }).catch((caught: unknown) => caught)

    expect((error as { code?: string }).code).toBe('FORBIDDEN')
    expect(state.workItems.size).toBe(0)
  })
})
