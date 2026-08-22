// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SCRUM_ACCESS_MODE, SessionAccessControl, createTranslate } from '@dsh-scrum/scrum-ui'
import type { SessionAccessActions, SessionAccessState } from '@dsh-scrum/scrum-ui'
import { mount, type Mounted } from '../support/dom.js'

const t = createTranslate()
let open: Mounted | null = null

afterEach(() => {
  open?.unmount()
  open = null
})

function screen(overrides: Partial<SessionAccessState> = {}): {
  mounted: Mounted
  handlers: SessionAccessActions
} {
  const handlers: SessionAccessActions = { setMode: vi.fn(), dismiss: vi.fn() }
  const state: SessionAccessState = {
    phase: 'ready',
    summary: {
      chosen: SCRUM_ACCESS_MODE.off,
      effective: SCRUM_ACCESS_MODE.off,
      degradations: [],
    },
    failure: null,
    busy: false,
    ...overrides,
  }
  const mounted = mount(createElement(SessionAccessControl, { state, actions: handlers, t }))
  open = mounted
  return { mounted, handlers }
}

describe('picking a mode', () => {
  it('sends the mode that was chosen', () => {
    const { mounted, handlers } = screen()

    mounted.click('#scrum-access-write')

    expect(handlers.setMode).toHaveBeenCalledWith(SCRUM_ACCESS_MODE.write)
  })

  it('marks the mode the store holds, not the one in force', () => {
    const { mounted } = screen({
      summary: {
        chosen: SCRUM_ACCESS_MODE.write,
        effective: SCRUM_ACCESS_MODE.read,
        degradations: ['archived'],
      },
    })

    expect((mounted.find('#scrum-access-write') as HTMLInputElement).checked).toBe(true)
    expect((mounted.find('#scrum-access-read') as HTMLInputElement).checked).toBe(false)
  })

  // Asserted as the attribute rather than by clicking one: a dispatched click
  // on a disabled control is suppressed by a browser and not by jsdom, so a
  // test that clicked would be checking the environment, not the component.
  it('rests every radio while a change is in flight', () => {
    const { mounted } = screen({ busy: true })

    for (const mode of ['off', 'read', 'write']) {
      expect((mounted.find(`#scrum-access-${mode}`) as HTMLInputElement).disabled).toBe(true)
    }
  })
})

describe('a message from the host', () => {
  it('is dismissed by the user rather than disappearing on its own', () => {
    const { mounted, handlers } = screen({
      failure: { kind: 'other', message: '当前工作区没有打开的会话' },
    })

    mounted.click('[data-scrum-dismiss]')

    expect(handlers.dismiss).toHaveBeenCalled()
  })
})
