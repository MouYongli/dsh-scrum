import { describe, expect, it, vi } from 'vitest'
import { PERMISSION, type Permission } from '@dsh-scrum/scrum-domain'
import { SCRUM_ACCESS_MODE, createSessionAccessController } from '@dsh-scrum/scrum-ui'
import type { SessionView } from '@dsh-scrum/scrum-ui'
import { stubClient } from '../support/client.js'

const READS: readonly Permission[] = [PERMISSION.projectView, PERMISSION.backlogView]
const WRITES: readonly Permission[] = [...READS, PERMISSION.workItemWrite]

function view(overrides: Partial<SessionView> = {}): SessionView {
  return {
    mode: SCRUM_ACCESS_MODE.off,
    granted: WRITES,
    permissions: [],
    projectArchived: false,
    ...overrides,
  }
}

describe('reading what the session may do', () => {
  it('starts unknown, which is not the same as off', () => {
    const controller = createSessionAccessController(stubClient({}), () => true)

    expect(controller.state().phase).toBe('loading')
    expect(controller.state().summary).toBeNull()
  })

  it('reports the mode the store holds and what it amounts to', async () => {
    const controller = createSessionAccessController(
      stubClient({
        session: () =>
          Promise.resolve(view({ mode: SCRUM_ACCESS_MODE.write, permissions: WRITES })),
      }),
      () => true,
    )

    await controller.load()

    expect(controller.state().summary).toEqual({
      chosen: SCRUM_ACCESS_MODE.write,
      effective: SCRUM_ACCESS_MODE.write,
      degradations: [],
    })
  })

  it('reports a session the host could not answer for', async () => {
    const controller = createSessionAccessController(
      stubClient({ session: () => Promise.reject(new Error('no Harness session is open')) }),
      () => true,
    )

    await controller.load()

    expect(controller.state().phase).toBe('failed')
    expect(controller.state().failure?.message).toBe('no Harness session is open')
    expect(controller.state().summary).toBeNull()
  })
})

describe('changing the mode', () => {
  it('shows what came back rather than what was asked for', async () => {
    const controller = createSessionAccessController(
      stubClient({
        session: () => Promise.resolve(view()),
        // Accepted, then narrowed by an archived project.
        setSessionAccess: () =>
          Promise.resolve(
            view({
              mode: SCRUM_ACCESS_MODE.write,
              permissions: READS,
              projectArchived: true,
            }),
          ),
      }),
      () => true,
    )
    await controller.load()

    await controller.setMode(SCRUM_ACCESS_MODE.write)

    expect(controller.state().summary?.chosen).toBe(SCRUM_ACCESS_MODE.write)
    expect(controller.state().summary?.effective).toBe(SCRUM_ACCESS_MODE.read)
    expect(controller.state().summary?.degradations).toContain('archived')
  })

  it('takes effect through the host rather than being remembered here', async () => {
    const sent: string[] = []
    const controller = createSessionAccessController(
      stubClient({
        session: () => Promise.resolve(view()),
        setSessionAccess: (mode) => {
          sent.push(mode)
          return Promise.resolve(view({ mode, permissions: READS }))
        },
      }),
      () => true,
    )
    await controller.load()

    await controller.setMode(SCRUM_ACCESS_MODE.read)

    expect(sent).toEqual([SCRUM_ACCESS_MODE.read])
  })

  it('reports a refused change and keeps the mode the store still holds', async () => {
    const controller = createSessionAccessController(
      stubClient({
        session: () => Promise.resolve(view({ mode: SCRUM_ACCESS_MODE.read, permissions: READS })),
        setSessionAccess: () => Promise.reject(new Error('session access is already read')),
      }),
      () => true,
    )
    await controller.load()

    await controller.setMode(SCRUM_ACCESS_MODE.read)

    expect(controller.state().failure?.message).toBe('session access is already read')
    expect(controller.state().summary?.chosen).toBe(SCRUM_ACCESS_MODE.read)
  })

  it('tells subscribers it is busy before the answer comes back', async () => {
    const seen: boolean[] = []
    const controller = createSessionAccessController(
      stubClient({
        session: () => Promise.resolve(view()),
        setSessionAccess: (mode) => Promise.resolve(view({ mode })),
      }),
      () => true,
    )
    await controller.load()
    controller.subscribe(() => seen.push(controller.state().busy))

    await controller.setMode(SCRUM_ACCESS_MODE.write)

    expect(seen[0]).toBe(true)
    expect(seen.at(-1)).toBe(false)
  })

  it('clears a message when the user acknowledges it', async () => {
    const controller = createSessionAccessController(
      stubClient({ session: () => Promise.reject(new Error('boom')) }),
      () => true,
    )
    await controller.load()

    controller.dismiss()

    expect(controller.state().failure).toBeNull()
  })
})

describe('a workspace that lost its project', () => {
  it('reports no access at all, and says the binding is why', async () => {
    const bound = vi.fn(() => false)
    const controller = createSessionAccessController(
      stubClient({
        session: () =>
          Promise.resolve(view({ mode: SCRUM_ACCESS_MODE.write, permissions: WRITES })),
      }),
      bound,
    )

    await controller.load()

    expect(controller.state().summary?.effective).toBe(SCRUM_ACCESS_MODE.off)
    expect(controller.state().summary?.degradations).toContain('binding')
  })
})
