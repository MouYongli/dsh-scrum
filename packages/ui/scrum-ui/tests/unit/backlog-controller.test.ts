import { describe, expect, it, vi } from 'vitest'
import { ConflictError, WORK_ITEM_TYPE, toRevision } from '@dsh-scrum/scrum-domain'
import {
  BACKLOG_GROUPING,
  DEFAULT_BACKLOG_QUERY,
  createBacklogController,
} from '@dsh-scrum/scrum-ui'
import type { BacklogQuery } from '@dsh-scrum/scrum-ui'
import { stubClient } from '../support/client.js'
import { item, itemId } from '../support/items.js'

const REVISION = toRevision(1)

describe('reading the backlog', () => {
  it('starts loading, before anything has been asked', () => {
    const controller = createBacklogController(stubClient({}))

    expect(controller.state().phase).toBe('loading')
    expect(controller.state().page.total).toBe(0)
  })

  it('asks for the unplanned items, which is what a product backlog is', async () => {
    const seen: (BacklogQuery | undefined)[] = []
    const controller = createBacklogController(
      stubClient({
        backlog: (query) => {
          seen.push(query)
          return Promise.resolve([])
        },
      }),
    )

    await controller.load()

    expect(seen).toEqual([DEFAULT_BACKLOG_QUERY])
  })

  it('projects what the client answered into a page', async () => {
    const controller = createBacklogController(
      stubClient({ backlog: () => Promise.resolve([item(1), item(2)]) }),
    )

    await controller.load()

    expect(controller.state().phase).toBe('ready')
    expect(controller.state().page.total).toBe(2)
  })

  it('blanks the screen when the read itself failed, and says so', async () => {
    const controller = createBacklogController(
      stubClient({ backlog: () => Promise.reject(new Error('the host is not reachable')) }),
    )

    await controller.load()

    expect(controller.state().phase).toBe('failed')
    expect(controller.state().failure).toEqual({
      kind: 'other',
      message: 'the host is not reachable',
    })
  })

  it('reports an empty project and an over-narrow filter differently', async () => {
    const controller = createBacklogController(stubClient({ backlog: () => Promise.resolve([]) }))
    await controller.load()

    expect(controller.state().page.emptiness).toBe('no-items')

    await controller.setQuery({ ...DEFAULT_BACKLOG_QUERY, text: '结算' })

    expect(controller.state().page.emptiness).toBe('no-matches')
  })

  it('does not count the sprint scope as a filter the user set', async () => {
    const controller = createBacklogController(stubClient({ backlog: () => Promise.resolve([]) }))

    await controller.setQuery({ planned: true })

    expect(controller.state().page.emptiness).toBe('no-items')
  })
})

describe('regrouping', () => {
  it('regroups what is already loaded, without asking again', async () => {
    const backlog = vi.fn(() => Promise.resolve([item(1, { type: WORK_ITEM_TYPE.epic })]))
    const controller = createBacklogController(stubClient({ backlog }))
    await controller.load()

    controller.setGrouping(BACKLOG_GROUPING.type)

    expect(controller.state().grouping).toBe(BACKLOG_GROUPING.type)
    expect(controller.state().page.groups[0]?.key).toBe(WORK_ITEM_TYPE.epic)
    expect(backlog).toHaveBeenCalledTimes(1)
  })
})

describe('the detail selection', () => {
  it('resolves the selected item from the list, not from a copy', async () => {
    const controller = createBacklogController(
      stubClient({ backlog: () => Promise.resolve([item(1, { title: '结算' })]) }),
    )
    await controller.load()

    controller.select(itemId(1))

    expect(controller.state().selected?.title).toBe('结算')
  })

  it('closes the panel when the item is no longer in the list', async () => {
    const pages = [[item(1)], []]
    const controller = createBacklogController(
      stubClient({ backlog: () => Promise.resolve(pages.shift() ?? []) }),
    )
    await controller.load()
    controller.select(itemId(1))

    await controller.load()

    expect(controller.state().selected).toBeNull()
  })
})

describe('writing', () => {
  it('reads the list back rather than patching in what the call returned', async () => {
    const backlog = vi.fn(() => Promise.resolve([item(1)]))
    const controller = createBacklogController(
      stubClient({ backlog, createWorkItem: () => Promise.resolve(item(2)) }),
    )
    await controller.load()

    await controller.create({ type: WORK_ITEM_TYPE.story, title: '结算' })

    expect(backlog).toHaveBeenCalledTimes(2)
    expect(controller.state().busy).toBe(false)
  })

  it('reports a refused write and keeps the list on screen', async () => {
    const controller = createBacklogController(
      stubClient({
        backlog: () => Promise.resolve([item(1)]),
        blockWorkItem: () => Promise.reject(new Error('a block needs a reason')),
      }),
    )
    await controller.load()

    await controller.block({ workItemId: itemId(1), expectedRevision: REVISION, reason: '' })

    expect(controller.state().phase).toBe('ready')
    expect(controller.state().page.total).toBe(1)
    expect(controller.state().failure?.kind).toBe('other')
  })

  it('names a revision conflict as one, so the screen can offer a refresh', async () => {
    const controller = createBacklogController(
      stubClient({
        backlog: () => Promise.resolve([item(1)]),
        updateWorkItem: () => Promise.reject(new ConflictError('SCR-1 has moved on', 1, 2)),
      }),
    )
    await controller.load()

    await controller.edit({
      workItemId: itemId(1),
      expectedRevision: REVISION,
      changes: { title: '改名' },
    })

    expect(controller.state().failure).toEqual({ kind: 'conflict', message: 'SCR-1 has moved on' })
    expect(controller.state().page.total).toBe(1)
  })

  it('clears the message when the user acknowledges it', async () => {
    const controller = createBacklogController(
      stubClient({
        backlog: () => Promise.resolve([]),
        updateWorkItem: () => Promise.reject(new ConflictError('SCR-1 has moved on', 1, 2)),
      }),
    )
    await controller.edit({ workItemId: itemId(1), expectedRevision: REVISION, changes: {} })

    controller.dismiss()

    expect(controller.state().failure).toBeNull()
  })

  it('tells subscribers it is busy before the write comes back', async () => {
    const seen: boolean[] = []
    const controller = createBacklogController(
      stubClient({
        backlog: () => Promise.resolve([]),
        createWorkItem: () => Promise.resolve(item(1)),
      }),
    )
    controller.subscribe(() => seen.push(controller.state().busy))

    await controller.create({ type: WORK_ITEM_TYPE.task, title: '接口' })

    expect(seen[0]).toBe(true)
    expect(seen.at(-1)).toBe(false)
  })

  it('routes every command to its own client call', async () => {
    const calls: string[] = []
    const record = (name: string) => (): Promise<never> => {
      calls.push(name)
      return Promise.resolve(item(1)) as Promise<never>
    }
    const controller = createBacklogController(
      stubClient({
        backlog: () => Promise.resolve([]),
        setAcceptanceCriterion: record('criterion'),
        moveWorkItemToRank: record('rank'),
        setWorkItemParent: record('parent'),
        setWorkItemDependency: record('dependency'),
      }),
    )
    const ref = { workItemId: itemId(1), expectedRevision: REVISION }

    await controller.setCriterion({ ...ref, index: 0, satisfied: true })
    await controller.rank({ ...ref, after: null, before: null })
    await controller.setParent({ ...ref, parentId: null })
    await controller.setDependency({ ...ref, dependsOnId: itemId(2), linked: true })

    expect(calls).toEqual(['criterion', 'rank', 'parent', 'dependency'])
  })
})
