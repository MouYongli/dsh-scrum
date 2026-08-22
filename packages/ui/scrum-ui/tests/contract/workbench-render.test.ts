import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConnectedWorkbench, Workbench, createTranslate, toCreateInput } from '@dsh-scrum/scrum-ui'
import type { EntryView, ScrumFailure, WorkbenchState } from '@dsh-scrum/scrum-ui'
import { stubClient } from '../support/client.js'

// Rendered to markup rather than asserted as an element tree. A tree assertion
// passes while the page shows nothing, because a component that returns the
// wrong branch still returns elements.

const WORKSPACE = { id: 'ws_1', name: 'shop-service' }
const PROJECT = { id: 'prj_1', key: 'SCR', name: 'shop-service', description: '' }
const t = createTranslate()

function render(state: WorkbenchState, onExit?: () => void): string {
  return renderToStaticMarkup(createElement(Workbench, { state, onExit }))
}

function ready(
  entry: EntryView,
  creating = false,
  failure: ScrumFailure | null = null,
): WorkbenchState {
  return { kind: 'ready', entry, creating, failure }
}

describe('the workbench frame', () => {
  it('names itself for a screen reader', () => {
    const markup = render(ready({ state: 'no-workspace' }))

    expect(markup).toContain('role="region"')
    expect(markup).toContain(`aria-label="${t('workbench.title')}"`)
  })

  it('offers the way back only when there is somewhere to go back to', () => {
    expect(render(ready({ state: 'no-workspace' }), () => {})).toContain('data-scrum-back')
    expect(render(ready({ state: 'no-workspace' }))).not.toContain('data-scrum-back')
  })

  it('says where the way back leads, rather than that it dismisses something', () => {
    // Scrum is a mode beside the conversation, so the control names the place
    // it returns to; 「关闭」 would describe a popup the surface is not.
    expect(render(ready({ state: 'no-workspace' }), () => {})).toContain(t('workbench.back'))
  })

  it('marks itself busy while it is still asking, and shows no page yet', () => {
    const markup = render({ kind: 'loading' })

    expect(markup).toContain('aria-busy="true"')
    expect(markup).not.toContain('data-scrum-page')
  })

  it('reports a client that cannot answer, rather than an empty page', () => {
    const markup = render({ kind: 'failed', message: 'not connected to a workspace' })

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('not connected to a workspace')
    expect(markup).toContain(t('error.title'))
  })
})

describe('the four first-run states', () => {
  it('renders the no-workspace page', () => {
    const markup = render(ready({ state: 'no-workspace' }))

    expect(markup).toContain('data-scrum-page="no-workspace"')
    expect(markup).toContain(t('state.noWorkspace.title'))
    expect(markup).not.toContain('data-scrum-wizard')
  })

  it('renders the unbound page with the creation wizard', () => {
    const markup = render(ready({ state: 'unbound', workspace: WORKSPACE }))

    expect(markup).toContain('data-scrum-page="unbound"')
    expect(markup).toContain(t('state.unbound.title'))
    expect(markup).toContain('data-scrum-wizard')
    expect(markup).toContain('data-scrum-connect')
    expect(markup).toContain(t('state.unbound.create'))
    expect(markup).toContain(t('state.unbound.connect'))
    expect(markup).toContain(t('wizard.key'))
  })

  it('renders the archived page without a wizard', () => {
    const markup = render(
      ready({ state: 'archived', workspace: WORKSPACE, project: PROJECT, moved: false }),
    )

    expect(markup).toContain('data-scrum-page="archived"')
    expect(markup).toContain(t('state.archived.title'))
    expect(markup).toContain('data-scrum-project="SCR"')
    expect(markup).not.toContain('data-scrum-wizard')
  })

  it('renders the stale binding page', () => {
    const markup = render(ready({ state: 'stale', workspace: WORKSPACE }))

    expect(markup).toContain('data-scrum-page="stale"')
    expect(markup).toContain(t('state.stale.title'))
  })

  it('raises the moved notice where the workspace has moved', () => {
    const markup = render(
      ready({ state: 'bound', workspace: WORKSPACE, project: PROJECT, moved: true }),
    )

    expect(markup).toContain('data-scrum-moved')
    expect(markup).toContain(t('state.moved.notice'))
  })

  it('names the workspace on every page that has one', () => {
    for (const state of [
      ready({ state: 'unbound', workspace: WORKSPACE }),
      ready({ state: 'stale', workspace: WORKSPACE }),
      ready({ state: 'bound', workspace: WORKSPACE, project: PROJECT, moved: false }),
    ]) {
      expect(render(state)).toContain('shop-service')
    }
    expect(render(ready({ state: 'no-workspace' }))).not.toContain('data-scrum-workspace')
  })
})

describe('the creation wizard', () => {
  const unbound = ready({ state: 'unbound', workspace: WORKSPACE })

  it('labels every field, so a screen reader can announce them', () => {
    const markup = render(unbound)

    for (const id of ['scrum-name', 'scrum-key', 'scrum-description']) {
      expect(markup).toContain(`for="${id}"`)
      expect(markup).toContain(`id="${id}"`)
    }
    expect(markup).toContain('aria-describedby="scrum-key-hint"')
    expect(markup).toContain(t('wizard.keyHint'))
  })

  it('requires the two fields a project cannot be created without', () => {
    const required = render(unbound).match(/<input[^>]*required[^>]*>/g) ?? []

    expect(required).toHaveLength(2)
  })

  it('disables the button and says so while a project is being created', () => {
    const markup = render(ready({ state: 'unbound', workspace: WORKSPACE }, true))

    expect(markup).toContain('disabled')
    expect(markup).toContain(t('wizard.creating'))
  })

  it('shows a refused creation above the form rather than in place of it', () => {
    const refused = ready({ state: 'unbound', workspace: WORKSPACE }, false, {
      kind: 'other',
      message: 'the key is already taken',
    })

    const markup = render(refused)

    expect(markup).toContain('data-scrum-create-failure="other"')
    expect(markup).toContain('the key is already taken')
    expect(markup).toContain('data-scrum-wizard')
    expect(markup.indexOf('data-scrum-create-failure')).toBeLessThan(
      markup.indexOf('data-scrum-wizard'),
    )
  })

  it('renders in English when the shell is English', () => {
    const markup = renderToStaticMarkup(
      createElement(Workbench, { state: unbound, t: createTranslate('en') }),
    )

    expect(markup).toContain('Create local project')
    expect(markup).toContain('Connect team Scrum')
    expect(markup).not.toContain('创建本地项目')
  })
})

describe('the resolved runtime context', () => {
  it('shows edition, service and tenant without turning edition into an action', () => {
    const markup = render(
      ready({
        state: 'unbound',
        workspace: WORKSPACE,
        runtimeContext: {
          edition: 'enterprise',
          serviceName: 'Acme Scrum',
          tenantName: 'Acme Engineering',
        },
      }),
    )

    expect(markup).toContain('data-scrum-runtime="enterprise"')
    expect(markup).toContain('Acme Scrum')
    expect(markup).toContain('Acme Engineering')
    expect(markup).not.toContain('<select')
  })
})

describe('the connected workbench', () => {
  it('shows the loading frame before the client has answered', () => {
    const markup = renderToStaticMarkup(
      createElement(ConnectedWorkbench, {
        client: stubClient({ entry: () => new Promise<EntryView>(() => undefined) }),
      }),
    )

    expect(markup).toContain('aria-busy="true"')
    expect(markup).not.toContain('data-scrum-page')
  })
})

describe('what the wizard submits', () => {
  it('upper-cases the key, because the identifier grammar has no lower case', () => {
    expect(toCreateInput('shop-service', 'scr', '')).toEqual({
      name: 'shop-service',
      key: 'SCR',
      description: '',
    })
  })

  it('leaves the name alone, because it belongs to the user', () => {
    expect(toCreateInput('  优惠券服务 ', 'SCR', '').name).toBe('  优惠券服务 ')
  })
})

describe('the project surface', () => {
  const surface = createElement('div', { 'data-scrum-surface': true }, 'backlog')

  function withSurface(entry: EntryView): string {
    return renderToStaticMarkup(createElement(Workbench, { state: ready(entry), surface }))
  }

  it('shows on a bound project and on an archived one', () => {
    expect(
      withSurface({ state: 'bound', workspace: WORKSPACE, project: PROJECT, moved: false }),
    ).toContain('data-scrum-surface')
    expect(
      withSurface({ state: 'archived', workspace: WORKSPACE, project: PROJECT, moved: false }),
    ).toContain('data-scrum-surface')
  })

  it('shows on none of the states that have no project to show one for', () => {
    expect(withSurface({ state: 'no-workspace' })).not.toContain('data-scrum-surface')
    expect(withSurface({ state: 'unbound', workspace: WORKSPACE })).not.toContain(
      'data-scrum-surface',
    )
    expect(withSurface({ state: 'stale', workspace: WORKSPACE })).not.toContain(
      'data-scrum-surface',
    )
  })
})
