import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { createWorkbenchStore } from '@dsh-scrum/scrum-ui'
import * as clientEntry from '@dsh-scrum/scrum-harness-client/client'

interface Registration {
  readonly name: string
  readonly id: string
  readonly component: unknown
}

/**
 * A slot registry that records what was registered and, unlike the real one,
 * lets a test declare the two slots one at a time — which is the case that
 * matters: they are declared by two host plugins and either can be late.
 */
class SlotsStub extends Service {
  readonly registered: Registration[] = []
  private readonly waiting = new Map<string, (() => void)[]>()

  constructor(ctx: Context) {
    super(ctx, 'slots')
  }

  declare(name: string): void {
    for (const run of this.waiting.get(name) ?? []) {
      run()
    }
    this.waiting.delete(name)
  }

  inject(name: string, callback: () => void): void {
    this.waiting.set(name, [...(this.waiting.get(name) ?? []), callback])
  }

  register(spec: { name: string; id: string }, component: unknown): () => void {
    this.registered.push({ ...spec, component })
    return () => undefined
  }
}

async function loaded(config: Record<string, unknown> = {}): Promise<SlotsStub> {
  const ctx = new Context()
  const slots = new SlotsStub(ctx)
  Object.defineProperty(ctx, 'slots', { value: slots, configurable: true })
  clientEntry.apply(ctx as never, config as never)
  await Promise.resolve()
  return slots
}

describe('where the workbench is registered', () => {
  it('waits for each slot to be declared rather than registering blindly', async () => {
    const slots = await loaded()

    expect(slots.registered).toEqual([])
  })

  it('registers the sidebar entry when only that slot is declared', async () => {
    const slots = await loaded()

    slots.declare('sidebar.footer.action')

    expect(slots.registered.map((entry) => entry.name)).toEqual(['sidebar.footer.action'])
  })

  it('registers the workbench in the root overlay, not in the conversation column', async () => {
    const slots = await loaded()

    slots.declare('shell.overlay')

    expect(slots.registered.map((entry) => entry.name)).toEqual(['shell.overlay'])
    expect(slots.registered[0]?.id).toBe('scrum')
  })

  it('gives both registrations one identifier, so the shell can address them', async () => {
    const slots = await loaded()

    slots.declare('sidebar.footer.action')
    slots.declare('shell.overlay')

    expect(new Set(slots.registered.map((entry) => entry.id))).toEqual(new Set(['scrum']))
  })

  it('declares the dependency that gates it', () => {
    // The slot registry gates the registrations; the other three are what the
    // workbench is scoped and carried by, and a shell missing any of them is a
    // shell this entry has nothing to say in.
    expect(clientEntry.inject).toEqual(['slots', 'connection', 'workspaces', 'sessions'])
    expect(clientEntry.name).toBe('scrum-harness-client')
  })
})

describe('opening and closing the workbench', () => {
  it('is one shared answer, so the entry and the overlay cannot disagree', async () => {
    const store = createWorkbenchStore()
    const slots = await loaded({ store })
    slots.declare('sidebar.footer.action')
    slots.declare('shell.overlay')
    const listener = vi.fn()
    store.subscribe(listener)

    store.toggle()

    expect(store.isOpen()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('survives a workspace or session change, because the store outlives them', () => {
    const store = createWorkbenchStore()
    store.open()

    // Whatever the shell tears down when the user picks another session, the
    // overlay is root-level and this store is not part of it.
    expect(store.isOpen()).toBe(true)
  })
})
