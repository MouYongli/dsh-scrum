import { describe, expect, it } from 'vitest'
import { toProjectKey, type WorkItem } from '@dsh-scrum/scrum-domain'
import { createHostApi } from '@dsh-scrum/scrum-harness-host'
import { MemoryStore, harness, ownerOf, runtime } from '../support/runtime.js'

/**
 * The three edits the detail panel makes that `updateWorkItem` cannot.
 *
 * Parent, dependency and acceptance are absent from `WorkItemDetailChanges`
 * because each carries a rule of its own, so each needs its own way in. What
 * is asserted here is that the host offers one and that it reaches the rule —
 * the rules themselves belong to the application tests.
 */

const NEW_PROJECT = { key: toProjectKey('SCR'), name: 'shop-service' }

function api(store: MemoryStore) {
  return createHostApi(harness(), runtime(store))
}

async function project(): Promise<MemoryStore> {
  const store = new MemoryStore()
  const created = await api(store).initialise(NEW_PROJECT)
  store.owners.set(created.project.id, ownerOf(created.project.id))
  return store
}

async function item(store: MemoryStore, title: string): Promise<WorkItem> {
  return await api(store).createWorkItem({ type: 'story', title })
}

async function caught(run: Promise<unknown>): Promise<{ code?: string }> {
  return (await run.catch((error: unknown) => error)) as { code?: string }
}

describe('setting a parent', () => {
  it('records the parent the caller named', async () => {
    const store = await project()
    const parent = await item(store, 'epic')
    const child = await item(store, 'story')

    const updated = await api(store).setWorkItemParent({
      workItemId: child.id,
      expectedRevision: child.revision,
      parentId: parent.id,
    })

    expect(updated.parentId).toBe(parent.id)
  })

  it('clears it when the caller names none', async () => {
    const store = await project()
    const parent = await item(store, 'epic')
    const child = await item(store, 'story')
    const linked = await api(store).setWorkItemParent({
      workItemId: child.id,
      expectedRevision: child.revision,
      parentId: parent.id,
    })

    const cleared = await api(store).setWorkItemParent({
      workItemId: linked.id,
      expectedRevision: linked.revision,
      parentId: null,
    })

    expect(cleared.parentId).toBeNull()
  })

  it('refuses a revision the caller was not looking at', async () => {
    const store = await project()
    const parent = await item(store, 'epic')
    const child = await item(store, 'story')
    await api(store).setWorkItemParent({
      workItemId: child.id,
      expectedRevision: child.revision,
      parentId: parent.id,
    })

    // The same revision a second time: what a second tab would send.
    const error = await caught(
      api(store).setWorkItemParent({
        workItemId: child.id,
        expectedRevision: child.revision,
        parentId: null,
      }),
    )

    expect(error.code).toBe('CONFLICT')
  })
})

describe('setting a dependency', () => {
  it('links and unlinks the same pair', async () => {
    const store = await project()
    const blocker = await item(store, 'api')
    const blocked = await item(store, 'screen')

    const linked = await api(store).setWorkItemDependency({
      workItemId: blocked.id,
      expectedRevision: blocked.revision,
      dependsOnId: blocker.id,
      linked: true,
    })
    expect(linked.dependsOn).toContain(blocker.id)

    const unlinked = await api(store).setWorkItemDependency({
      workItemId: linked.id,
      expectedRevision: linked.revision,
      dependsOnId: blocker.id,
      linked: false,
    })
    expect(unlinked.dependsOn).not.toContain(blocker.id)
  })

  it('refuses a dependency on an item outside the project', async () => {
    const store = await project()
    const blocked = await item(store, 'screen')

    // A well-formed identifier from another project's key. The rule is the
    // application's; what matters here is that the host call reaches it rather
    // than storing a reference that resolves to nothing.
    const error = await caught(
      api(store).setWorkItemDependency({
        workItemId: blocked.id,
        expectedRevision: blocked.revision,
        dependsOnId: 'OTH-2' as never,
        linked: true,
      }),
    )

    expect(error).toMatchObject({ code: 'VALIDATION', details: { workItemId: 'OTH-2' } })
  })
})

describe('marking a criterion', () => {
  it('ticks the one the caller named and leaves the rest', async () => {
    const store = await project()
    const created = await api(store).createWorkItem({
      type: 'story',
      title: 'login',
      acceptanceCriteria: [
        { text: 'redirects', satisfied: false },
        { text: 'remembers', satisfied: false },
      ],
    })

    const updated = await api(store).setAcceptanceCriterion({
      workItemId: created.id,
      expectedRevision: created.revision,
      index: 1,
      satisfied: true,
    })

    expect(updated.acceptanceCriteria.map((criterion) => criterion.satisfied)).toEqual([
      false,
      true,
    ])
  })

  it('refuses an index the item does not have', async () => {
    const store = await project()
    const created = await item(store, 'login')

    const error = await caught(
      api(store).setAcceptanceCriterion({
        workItemId: created.id,
        expectedRevision: created.revision,
        index: 0,
        satisfied: true,
      }),
    )

    expect(error.code).toBe('VALIDATION')
  })
})
