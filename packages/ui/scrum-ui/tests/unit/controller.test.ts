import { describe, expect, it, vi } from 'vitest'
import { createWorkbenchController } from '@dsh-scrum/scrum-ui'
import type { CreateProjectInput, EntryView, ScrumClient } from '@dsh-scrum/scrum-ui'
import { stubClient } from '../support/client.js'

const WORKSPACE = { id: 'ws_1', name: 'shop-service' }
const PROJECT = { id: 'prj_1', key: 'SCR', name: 'shop-service', description: '' }

function client(entries: EntryView[], onCreate?: (input: CreateProjectInput) => void): ScrumClient {
  return stubClient({
    entry: () => Promise.resolve(entries.shift() ?? { state: 'no-workspace' }),
    createProject: (input) => {
      onCreate?.(input)
      return Promise.resolve(PROJECT)
    },
  })
}

describe('the workbench controller', () => {
  it('starts loading, before anything has been asked', () => {
    expect(createWorkbenchController(client([])).state()).toEqual({ kind: 'loading' })
  })

  it('reports what the client answered', async () => {
    const controller = createWorkbenchController(
      client([{ state: 'unbound', workspace: WORKSPACE }]),
    )

    await controller.load()

    expect(controller.state()).toEqual({
      kind: 'ready',
      entry: { state: 'unbound', workspace: WORKSPACE },
      creating: false,
      failure: null,
    })
  })

  it('reports a client that could not answer', async () => {
    const controller = createWorkbenchController(
      stubClient({
        entry: () => Promise.reject(new Error('not connected')),
        createProject: () => Promise.reject(new Error('not connected')),
      }),
    )

    await controller.load()

    expect(controller.state()).toEqual({ kind: 'failed', message: 'not connected' })
  })

  it('creates the project the wizard described, and asks again afterwards', async () => {
    const created: CreateProjectInput[] = []
    const controller = createWorkbenchController(
      client(
        [
          { state: 'unbound', workspace: WORKSPACE },
          { state: 'bound', workspace: WORKSPACE, project: PROJECT, moved: false },
        ],
        (input) => created.push(input),
      ),
    )
    await controller.load()

    await controller.create({ key: 'SCR', name: 'shop-service' })

    expect(created).toEqual([{ key: 'SCR', name: 'shop-service' }])
    // Reloaded rather than patched from the response: the page is the host's
    // answer, and one assembled here would be a second answer that can differ.
    expect(controller.state()).toMatchObject({ kind: 'ready', entry: { state: 'bound' } })
  })

  it('keeps the page on screen while it creates', async () => {
    const seen: string[] = []
    const controller = createWorkbenchController(
      client([{ state: 'unbound', workspace: WORKSPACE }]),
    )
    await controller.load()
    controller.subscribe(() => {
      const state = controller.state()
      seen.push(state.kind === 'ready' ? `ready:${String(state.creating)}` : state.kind)
    })

    await controller.create({ key: 'SCR', name: 'shop-service' })

    expect(seen[0]).toBe('ready:true')
  })

  it('keeps the page when a creation failed, so the form is still there to fix', async () => {
    const controller = createWorkbenchController(
      stubClient({
        entry: () => Promise.resolve({ state: 'unbound', workspace: WORKSPACE }),
        createProject: () => Promise.reject(new Error('the key is already taken')),
      }),
    )
    await controller.load()

    await controller.create({ key: 'SCR', name: 'shop-service' })

    expect(controller.state()).toEqual({
      kind: 'ready',
      entry: { state: 'unbound', workspace: WORKSPACE },
      creating: false,
      failure: { kind: 'other', message: 'the key is already taken' },
    })
  })

  it('drops a previous refusal when the next attempt starts', async () => {
    const controller = createWorkbenchController(
      stubClient({
        entry: () => Promise.resolve({ state: 'unbound', workspace: WORKSPACE }),
        createProject: () => Promise.reject(new Error('the key is already taken')),
      }),
    )
    await controller.load()
    await controller.create({ key: 'SCR', name: 'shop-service' })
    const seen: (string | null)[] = []
    controller.subscribe(() => {
      const state = controller.state()
      seen.push(state.kind === 'ready' ? (state.failure?.kind ?? null) : state.kind)
    })

    await controller.create({ key: 'SCR', name: 'shop-service' })

    expect(seen[0]).toBeNull()
  })

  it('stops telling a listener that unsubscribed', async () => {
    const controller = createWorkbenchController(client([{ state: 'no-workspace' }]))
    const listener = vi.fn()
    controller.subscribe(listener)()

    await controller.load()

    expect(listener).not.toHaveBeenCalled()
  })
})
