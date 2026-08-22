import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SCRUM_ACCESS_MODE, SessionAccessControl, createTranslate } from '@dsh-scrum/scrum-ui'
import type { SessionAccessActions, SessionAccessState } from '@dsh-scrum/scrum-ui'

const t = createTranslate()

const actions: SessionAccessActions = { setMode: vi.fn(), dismiss: vi.fn() }

function state(overrides: Partial<SessionAccessState> = {}): SessionAccessState {
  return {
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
}

function render(overrides: Partial<SessionAccessState> = {}): string {
  return renderToStaticMarkup(
    createElement(SessionAccessControl, { state: state(overrides), actions, t }),
  )
}

describe('the access selector', () => {
  it('shows all three modes, so the user can see how far the door is open', () => {
    const markup = render()

    for (const mode of ['off', 'read', 'write']) {
      expect(markup).toContain(`id="scrum-access-${mode}"`)
      expect(markup).toContain(`<label for="scrum-access-${mode}">`)
    }
    expect(markup).toContain('type="radio"')
  })

  it('marks the mode the store holds, not the one in force', () => {
    const markup = render({
      summary: {
        chosen: SCRUM_ACCESS_MODE.write,
        effective: SCRUM_ACCESS_MODE.read,
        degradations: ['archived'],
      },
    })

    expect(markup).toContain('data-scrum-access-chosen="write"')
    expect(markup).toContain('data-scrum-access-effective="read"')
  })

  it('explains every mode, so nobody has to try one to learn what it does', () => {
    const markup = render()

    expect(markup).toContain(t('access.off.hint'))
    expect(markup).toContain(t('access.read.hint'))
    expect(markup).toContain(t('access.write.hint'))
    expect(markup).toContain('aria-describedby="scrum-access-off-hint"')
  })

  it('says a change applies on the next call, without restarting the session', () => {
    expect(render()).toContain(t('access.body'))
  })
})

describe('what is in force', () => {
  it('is stated whether or not it matches the choice', () => {
    const matching = render()

    expect(matching).toContain(t('access.effective'))
    expect(matching).toContain('role="status"')
    expect(matching).not.toContain('data-scrum-access-degraded')
  })

  it('names an archived project when write became read', () => {
    const markup = render({
      summary: {
        chosen: SCRUM_ACCESS_MODE.write,
        effective: SCRUM_ACCESS_MODE.read,
        degradations: ['archived'],
      },
    })

    expect(markup).toContain('data-scrum-access-degraded="1"')
    expect(markup).toContain(t('access.degraded.archived'))
  })

  it('names roles and a lost binding as their own reasons', () => {
    const both = render({
      summary: {
        chosen: SCRUM_ACCESS_MODE.write,
        effective: SCRUM_ACCESS_MODE.off,
        degradations: ['binding', 'roles'],
      },
    })

    expect(both).toContain(t('access.degraded.binding'))
    expect(both).toContain(t('access.degraded.roles'))
  })
})

describe('the states it can be in', () => {
  it('says it is asking rather than claiming the agent is off', () => {
    const markup = render({ phase: 'loading', summary: null })

    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain(t('access.loading'))
    expect(markup).not.toContain('data-scrum-access-modes')
  })

  it('reports a host that could not answer, and offers no selector', () => {
    const markup = render({
      phase: 'failed',
      summary: null,
      failure: { kind: 'other', message: '当前工作区没有打开的会话' },
    })

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('当前工作区没有打开的会话')
    expect(markup).not.toContain('data-scrum-access-modes')
  })

  it('rests the radios while a change is in flight', () => {
    expect(render({ busy: true })).toContain('disabled=""')
  })
})
