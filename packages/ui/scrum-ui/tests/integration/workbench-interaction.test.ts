// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROJECT_ROLES, SPRINT_STATUS } from '@dsh-scrum/scrum-domain'
import { ConnectedWorkbench, createTranslate } from '@dsh-scrum/scrum-ui'
import type { EntryView, ScrumClient } from '@dsh-scrum/scrum-ui'
import { stubClient } from '../support/client.js'
import { mount, type Mounted } from '../support/dom.js'
import { item, sprint } from '../support/items.js'

// The connected half: the workbench mounted over a client, the three tabs and
// what each one asks for when it appears.

const t = createTranslate()
let open: Mounted | null = null

afterEach(() => {
  open?.unmount()
  open = null
})

const BOUND: EntryView = {
  state: 'bound',
  workspace: { id: 'ws_1', name: 'shop-service' },
  project: { id: 'prj_1', key: 'SCR', name: 'shop-service', description: '' },
  moved: false,
}

/** Settles the effects each connected screen runs when it appears. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function workbench(client: ScrumClient, onConnectTeam?: (workspaceId: string) => void): Mounted {
  const mounted = mount(createElement(ConnectedWorkbench, { client, t, onConnectTeam }))
  open = mounted
  return mounted
}

describe('a workbench over a bound project', () => {
  it('opens on the home page and loads the backlog when its tab is selected', async () => {
    const backlog = vi.fn(() => Promise.resolve([item(1, { title: '结算对账' })]))
    const mounted = workbench(stubClient({ entry: () => Promise.resolve(BOUND), backlog }))

    await settle()

    expect(backlog).not.toHaveBeenCalled()
    expect(mounted.find('[data-scrum-surface]').dataset['scrumSurface']).toBe('home')
    expect(mounted.container.querySelector('[data-scrum-home]')).not.toBeNull()

    mounted.click('[data-scrum-section="backlog"]')
    await settle()
    expect(backlog).toHaveBeenCalled()
    expect(mounted.container.textContent).toContain('SCR-1 · 结算对账')
  })

  it('describes a personal Community owner without offering role editing', async () => {
    const mounted = workbench(
      stubClient({
        entry: () => Promise.resolve(BOUND),
        authorization: () =>
          Promise.resolve({
            permissions: [],
            projectArchived: false,
            membership: { mode: 'personal', roles: PROJECT_ROLES },
          }),
      }),
    )
    await settle()

    expect(mounted.container.querySelector('[data-scrum-personal-owner]')).not.toBeNull()
    expect(mounted.container.textContent).toContain('个人项目 · 本地 Owner')
    expect(mounted.find('[data-scrum-owner-roles]').textContent).toContain('administrator')
    expect(mounted.container.querySelector('[data-scrum-member-editor]')).toBeNull()
  })

  it('switches to the board without exposing a session access control', async () => {
    const sprints = vi.fn(() => Promise.resolve([sprint(1, { status: SPRINT_STATUS.active })]))
    const mounted = workbench(
      stubClient({
        entry: () => Promise.resolve(BOUND),
        backlog: () => Promise.resolve([]),
        sprints,
      }),
    )
    await settle()

    mounted.click('[data-scrum-section="sprint"]')
    await settle()
    expect(sprints).toHaveBeenCalled()
    expect(mounted.container.querySelector('[data-scrum-sprints]')).not.toBeNull()

    expect(mounted.container.querySelector('[data-scrum-section="access"]')).toBeNull()
  })

  it('shows the workbench as busy while the client has not answered', () => {
    const mounted = workbench(stubClient({ entry: () => new Promise<EntryView>(() => undefined) }))

    expect(mounted.find('[data-scrum-workbench]').getAttribute('aria-busy')).toBe('true')
  })
})

describe('a workspace with no project yet', () => {
  it('starts the team connection boundary without losing a local project draft', async () => {
    const connect = vi.fn()
    const mounted = workbench(
      stubClient({
        entry: () =>
          Promise.resolve({ state: 'unbound', workspace: { id: 'ws_1', name: 'shop-service' } }),
      }),
      connect,
    )
    await settle()

    mounted.type('#scrum-name', 'draft project')
    mounted.click('[data-scrum-connect]')

    expect(connect).toHaveBeenCalledWith('ws_1')
    expect(mounted.container.textContent).toContain(t('connect.body'))
    expect((mounted.find('#scrum-name') as HTMLInputElement).value).toBe('draft project')
    expect(mounted.container.textContent).not.toContain('选择 Teams')
    expect(mounted.container.textContent).not.toContain('选择 Enterprise')
  })

  it('creates one from the wizard and asks the host again', async () => {
    const created: unknown[] = []
    const entries: EntryView[] = [
      { state: 'unbound', workspace: { id: 'ws_1', name: 'shop-service' } },
      BOUND,
    ]
    const mounted = workbench(
      stubClient({
        entry: () => Promise.resolve(entries.shift() ?? BOUND),
        backlog: () => Promise.resolve([]),
        createProject: (input) => {
          created.push(input)
          return Promise.resolve({ id: 'prj_1', key: 'SCR', name: 'shop-service', description: '' })
        },
      }),
    )
    await settle()

    mounted.type('#scrum-name', 'shop-service')
    mounted.type('#scrum-key', 'scr')
    mounted.submit('[data-scrum-wizard]')
    await settle()

    // The key is upper-cased, and the page comes from a fresh entry read.
    expect(created).toEqual([{ name: 'shop-service', key: 'SCR', description: '' }])
    expect(mounted.container.querySelector('[data-scrum-page="bound"]')).not.toBeNull()
  })

  it('keeps what was typed when the host refuses the creation', async () => {
    const mounted = workbench(
      stubClient({
        entry: () =>
          Promise.resolve({ state: 'unbound', workspace: { id: 'ws_1', name: 'shop-service' } }),
        createProject: () => Promise.reject(new Error('the key is already taken')),
      }),
    )
    await settle()

    mounted.type('#scrum-name', 'shop-service')
    mounted.type('#scrum-key', 'SCR')
    mounted.submit('[data-scrum-wizard]')
    await settle()

    expect(mounted.find('[data-scrum-create-failure]').textContent).toContain(
      'the key is already taken',
    )
    expect((mounted.find('#scrum-name') as HTMLInputElement).value).toBe('shop-service')
    expect((mounted.find('#scrum-key') as HTMLInputElement).value).toBe('SCR')
    // The button is usable again rather than left saying it is still creating.
    expect((mounted.find('[data-scrum-submit]') as HTMLButtonElement).disabled).toBe(false)
  })

  it('refuses a key the host would refuse, naming the field rather than calling', async () => {
    const createProject = vi.fn()
    const mounted = workbench(
      stubClient({
        entry: () =>
          Promise.resolve({ state: 'unbound', workspace: { id: 'ws_1', name: 'shop-service' } }),
        createProject,
      }),
    )
    await settle()

    mounted.type('#scrum-name', 'shop-service')
    // What the hint used to suggest: a work item identifier, which the key
    // grammar does not admit.
    mounted.type('#scrum-key', 'SCR-12')
    mounted.submit('[data-scrum-wizard]')
    await settle()

    expect(createProject).not.toHaveBeenCalled()
    expect(mounted.find('[data-scrum-field-error="scrum-key"]').textContent).toBe(
      t('wizard.keyInvalid'),
    )
    expect(mounted.find('#scrum-key').getAttribute('aria-invalid')).toBe('true')
    // The form is still there, still holding what was typed.
    expect((mounted.find('#scrum-name') as HTMLInputElement).value).toBe('shop-service')
  })

  it('drops the refusal as soon as the key is being corrected', async () => {
    const mounted = workbench(
      stubClient({
        entry: () =>
          Promise.resolve({ state: 'unbound', workspace: { id: 'ws_1', name: 'shop-service' } }),
      }),
    )
    await settle()

    mounted.type('#scrum-name', 'shop-service')
    mounted.type('#scrum-key', 'SCR-12')
    mounted.submit('[data-scrum-wizard]')
    await settle()
    mounted.type('#scrum-key', 'SCR')

    expect(mounted.container.querySelector('[data-scrum-field-error="scrum-key"]')).toBeNull()
  })
})
