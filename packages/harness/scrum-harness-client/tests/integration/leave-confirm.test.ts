/**
 * @vitest-environment jsdom
 *
 * The question a leave raises when something is half typed.
 *
 * Mounted end to end rather than asserted on the store, because the point of
 * the arrangement is that the question is drawn by the surface holding the
 * drafts: a leave that switched mode first would have nowhere to draw it.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createDraftRegistry,
  createScrumModeStore,
  createTranslate,
  type DraftRegistry,
  type ScrumModeStore,
} from '@dsh-scrum/scrum-ui'
import { registrations, sessionsStub, type SessionsStub } from '../support/shell.js'

const roots: Root[] = []
const t = createTranslate()

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.replaceChildren()
})

interface Shell {
  readonly store: ScrumModeStore
  readonly drafts: DraftRegistry
  readonly host: HTMLElement
  readonly sessions: SessionsStub
  readonly question: () => HTMLElement | null
  readonly click: (selector: string) => void
  readonly escape: () => void
}

function shell(): Shell {
  const drafts = createDraftRegistry()
  const store = createScrumModeStore({ initial: 'scrum', drafts })
  const sessions = sessionsStub({ phase: 'ready', current: 'session-a' })
  const overlay = registrations({ store, drafts }, { sessions }).get('shell.overlay')!
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(createElement(overlay))
  })
  return {
    store,
    drafts,
    host,
    sessions,
    question: () => host.querySelector<HTMLElement>('[data-scrum-leave]'),
    click: (selector) => {
      act(() => {
        host
          .querySelector<HTMLElement>(selector)!
          .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
    },
    escape: () => {
      act(() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        )
      })
    },
  }
}

describe('going back with unsaved work', () => {
  it('asks nothing of someone who was only reading', () => {
    const view = shell()

    view.click('[data-scrum-back]')

    expect(view.store.mode()).toBe('conversation')
    expect(view.question()).toBeNull()
  })

  it('asks, and keeps the workbench on screen while it does', () => {
    const view = shell()
    act(() => {
      view.drafts.hold()
    })

    view.click('[data-scrum-back]')

    expect(view.question()?.textContent).toContain(t('leave.title'))
    expect(view.host.querySelector('[data-scrum-workbench]')).not.toBeNull()
  })

  it('goes back when the answer is to discard', () => {
    const view = shell()
    act(() => {
      view.drafts.hold()
    })
    view.click('[data-scrum-back]')

    view.click('[data-scrum-leave-discard]')

    expect(view.store.mode()).toBe('conversation')
  })

  it('stays, and takes the question down, when the answer is to keep editing', () => {
    const view = shell()
    act(() => {
      view.drafts.hold()
    })
    view.click('[data-scrum-back]')

    view.click('[data-scrum-leave-resume]')

    expect(view.store.mode()).toBe('scrum')
    expect(view.question()).toBeNull()
  })

  it('takes Escape as the answer to keep editing while it is asking', () => {
    const view = shell()
    act(() => {
      view.drafts.hold()
    })
    view.click('[data-scrum-back]')

    view.escape()

    // A key that did nothing here would read as the workbench having stopped
    // listening to the keyboard entirely.
    expect(view.store.mode()).toBe('scrum')
    expect(view.question()).toBeNull()
  })

  it('asks when the shell changes session out from under a half typed form', () => {
    const view = shell()
    act(() => {
      view.drafts.hold()
    })

    act(() => {
      view.sessions.publish({ phase: 'ready', current: 'session-b' })
    })

    // The shell has already moved; the question is about what to do with the
    // typing, not about whether the session change happens.
    expect(view.question()).not.toBeNull()
    expect(view.store.mode()).toBe('scrum')
  })

  it('goes to the session the user picked once they discard the typing', () => {
    const view = shell()
    act(() => {
      view.drafts.hold()
    })
    act(() => {
      view.sessions.publish({ phase: 'ready', current: 'session-b' })
    })

    view.click('[data-scrum-leave-discard]')

    expect(view.store.mode()).toBe('conversation')
  })

  it('finishes the leave when the form behind the question is dealt with', () => {
    const view = shell()
    let release = (): void => undefined
    act(() => {
      release = view.drafts.hold()
    })
    view.click('[data-scrum-back]')

    act(() => {
      release()
    })

    expect(view.store.mode()).toBe('conversation')
  })
})
