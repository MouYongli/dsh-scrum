import { describe, expect, it } from 'vitest'
import { ConflictError, toRevision, type WorkItem } from '@dsh-scrum/scrum-domain'
import { createBacklogController } from '@dsh-scrum/scrum-ui'
import { stubClient } from '../support/client.js'
import { item, itemId } from '../support/items.js'

// A revision conflict end to end: the write is refused, the screen keeps what
// the user was reading and offers a refresh, and the refresh brings back what
// the other writer left. Nothing is overwritten on the way through.

describe('a revision conflict on the backlog', () => {
  it('refuses the write, keeps the list and comes back with the newer version', async () => {
    const stale = item(1, { title: '结算对账' })
    const written: WorkItem = {
      ...item(1, { title: '别人改过的标题' }),
      revision: toRevision(2),
    }
    let current = stale
    const controller = createBacklogController(
      stubClient({
        backlog: () => Promise.resolve([current]),
        updateWorkItem: () => {
          current = written
          return Promise.reject(new ConflictError('SCR-1 has moved on', 1, 2))
        },
      }),
    )
    await controller.load()

    await controller.edit({
      workItemId: itemId(1),
      expectedRevision: stale.revision,
      changes: { title: '我的标题' },
    })

    // Refused, and nothing about the list moved: the user keeps their place.
    expect(controller.state().failure?.kind).toBe('conflict')
    expect(controller.state().page.groups[0]?.rows[0]?.item.title).toBe('结算对账')

    await controller.load()

    expect(controller.state().page.groups[0]?.rows[0]?.item.title).toBe('别人改过的标题')
    expect(controller.state().page.groups[0]?.rows[0]?.item.revision).toBe(toRevision(2))
  })

  it('never retries the refused write by itself', async () => {
    const writes: number[] = []
    const controller = createBacklogController(
      stubClient({
        backlog: () => Promise.resolve([item(1)]),
        moveWorkItemToRank: () => {
          writes.push(writes.length)
          return Promise.reject(new ConflictError('SCR-1 has moved on', 1, 2))
        },
      }),
    )
    await controller.load()

    await controller.rank({
      workItemId: itemId(1),
      expectedRevision: toRevision(1),
      after: null,
      before: null,
    })

    // Retrying with the revision the error reported is a lost update spelled
    // out in full, so the screen asks instead.
    expect(writes).toHaveLength(1)
  })
})
