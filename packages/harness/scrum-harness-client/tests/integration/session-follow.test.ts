/**
 * @vitest-environment jsdom
 *
 * Leaving Scrum when the shell changes session.
 *
 * The watcher is a subscription rather than a render, so a static render never
 * runs it: the overlay has to be mounted in a document and the shell's session
 * list driven by hand. Every case here is one of the three ways the shell can
 * put another session on screen, or one of the two changes that must not count
 * as the user going anywhere.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { createScrumModeStore, type ScrumModeStore } from '@dsh-scrum/scrum-ui'
import { registrations, sessionsStub, type SessionListSnapshot } from '../support/shell.js'

const roots: Root[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.replaceChildren()
})

/** Mounts the overlay against a shell whose session list starts where told. */
function mounted(
  store: ScrumModeStore,
  initial: SessionListSnapshot = { phase: 'ready', current: 'session-a' },
): ReturnType<typeof sessionsStub> {
  const sessions = sessionsStub(initial)
  const overlay = registrations({ store }, { sessions }).get('shell.overlay')!
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(createElement(overlay))
  })
  return sessions
}

describe('when the shell changes session', () => {
  it('stays in Scrum on the first snapshot it observes', () => {
    const store = createScrumModeStore({ initial: 'scrum' })

    const sessions = mounted(store)
    // The same answer again is not a change, however many times it arrives.
    act(() => {
      sessions.publish({ phase: 'ready', current: 'session-a' })
    })

    expect(store.mode()).toBe('scrum')
  })

  it('goes back to the conversation when another session is opened', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    const sessions = mounted(store)

    act(() => {
      sessions.publish({ phase: 'ready', current: 'session-b' })
    })

    expect(store.mode()).toBe('conversation')
  })

  it('goes back when a new session clears the selection, having no workspace to connect', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    const sessions = mounted(store)

    // `startSession` with no workspace at all clears rather than opens.
    act(() => {
      sessions.publish({ phase: 'ready', current: undefined })
    })

    expect(store.mode()).toBe('conversation')
  })

  it('keeps its baseline current while the user is in the conversation', () => {
    const store = createScrumModeStore()
    const sessions = mounted(store)

    act(() => {
      sessions.publish({ phase: 'ready', current: 'session-b' })
    })
    store.enter()

    // The change happened before the user entered Scrum, so entering must not
    // be answered by an exit built on a baseline from two sessions ago.
    expect(store.mode()).toBe('scrum')
  })

  it('does not act on a list that has not finished arriving', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    const sessions = mounted(store, { phase: 'pending', current: undefined })

    act(() => {
      sessions.publish({ phase: 'pending', current: 'session-a' })
    })

    expect(store.mode()).toBe('scrum')
  })

  it('does not treat the shell’s own startup selection as the user going somewhere', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    const sessions = mounted(store, { phase: 'pending', current: undefined })

    // Boot order: the list settles, then the shell connects a workspace and
    // opens its session. Someone who reached Scrum in between stays there.
    act(() => {
      sessions.publish({ phase: 'ready', current: undefined })
    })
    act(() => {
      sessions.publish({ phase: 'ready', current: 'session-a' })
    })

    expect(store.mode()).toBe('scrum')
  })

  it('acts on a selection that returns after the shell has had one', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    const sessions = mounted(store, { phase: 'ready', current: undefined })

    act(() => {
      sessions.publish({ phase: 'ready', current: 'session-a' })
    })
    act(() => {
      sessions.publish({ phase: 'ready', current: undefined })
    })
    store.enter()
    act(() => {
      sessions.publish({ phase: 'ready', current: 'session-b' })
    })

    // Only the first arrival is startup; a later one is a New Session.
    expect(store.mode()).toBe('conversation')
  })

  it('lets go of the shell when the overlay is torn down', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    const sessions = mounted(store)

    expect(sessions.listeners()).toBe(1)
    act(() => {
      roots.splice(0).forEach((root) => {
        root.unmount()
      })
    })

    expect(sessions.listeners()).toBe(0)
  })

  it('renders against a shell that publishes no session list at all', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    const overlay = registrations({ store }).get('shell.overlay')!
    const host = document.body.appendChild(document.createElement('div'))
    const root = createRoot(host)
    roots.push(root)

    // Developer Preview: a shell without the service must lose the exit, not
    // the workbench.
    act(() => {
      root.render(createElement(overlay))
    })

    expect(host.querySelector('[data-scrum-overlay]')).not.toBeNull()
    expect(store.mode()).toBe('scrum')
  })
})
