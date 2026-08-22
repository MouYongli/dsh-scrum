/**
 * @vitest-environment jsdom
 *
 * Escape as the other way back to the conversation.
 *
 * A keyboard listener is not visible in markup, so the overlay is mounted in a
 * document and the keys are dispatched at it. The cases that matter are the
 * ones where a key that reads as Escape is not a request to leave: an input
 * method holding it, and an inner element that has already answered.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { createScrumModeStore, type ScrumModeStore } from '@dsh-scrum/scrum-ui'
import { registrations } from '../support/shell.js'

const roots: Root[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.replaceChildren()
})

function mounted(store: ScrumModeStore): HTMLElement {
  const overlay = registrations({ store }).get('shell.overlay')!
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(createElement(overlay))
  })
  return host
}

/** Sends one key the way the shell's document would deliver it. */
function press(init: KeyboardEventInit & { key: string }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  act(() => {
    document.dispatchEvent(event)
  })
  return event
}

describe('pressing Escape', () => {
  it('goes back to the conversation', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    mounted(store)

    press({ key: 'Escape' })

    expect(store.mode()).toBe('conversation')
  })

  it('answers even though the focus is still on the sidebar entry', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    const host = mounted(store)

    // Entering from the sidebar never moves the focus into the workbench, so a
    // listener bound to the overlay would not have seen this at all.
    expect(host.contains(document.activeElement)).toBe(false)
    press({ key: 'Escape' })

    expect(store.mode()).toBe('conversation')
  })

  it('ignores the Escape an input method is holding', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    mounted(store)

    // Closing a Chinese candidate window is not a request to leave Scrum.
    press({ key: 'Escape', isComposing: true })

    expect(store.mode()).toBe('scrum')
  })

  it('ignores the composing Escape a browser reports only as a key code', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    mounted(store)

    press({ key: 'Escape', keyCode: 229 })

    expect(store.mode()).toBe('scrum')
  })

  it('leaves an Escape something nested has already answered alone', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    mounted(store)

    const answered = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    answered.preventDefault()
    act(() => {
      document.dispatchEvent(answered)
    })

    expect(store.mode()).toBe('scrum')
  })

  it('claims the key it acts on, so nothing behind the workbench answers it too', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    mounted(store)

    expect(press({ key: 'Escape' }).defaultPrevented).toBe(true)
  })

  it('does nothing for any other key', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    mounted(store)

    press({ key: 'Enter' })
    press({ key: 'Esc' })

    expect(store.mode()).toBe('scrum')
  })

  it('is not listening while the shell is in the conversation', () => {
    const store = createScrumModeStore()
    mounted(store)

    expect(press({ key: 'Escape' }).defaultPrevented).toBe(false)
    expect(store.mode()).toBe('conversation')
  })

  it('stops listening once the workbench is left', () => {
    const store = createScrumModeStore({ initial: 'scrum' })
    mounted(store)

    press({ key: 'Escape' })

    expect(press({ key: 'Escape' }).defaultPrevented).toBe(false)
  })
})
