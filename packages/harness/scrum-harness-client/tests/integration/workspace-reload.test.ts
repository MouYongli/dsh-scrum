/**
 * @vitest-environment jsdom
 *
 * Reloading the workbench when the shell changes workspace.
 *
 * A Scrum project belongs to a workspace, so a workbench still showing the
 * previous one would be showing another project's work. The reload is a
 * remount, which is not visible in markup — the assertion is that the surface
 * asked its client again.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createScrumModeStore,
  createTranslate,
  disconnectedClient,
  type ScrumClient,
} from '@dsh-scrum/scrum-ui'
import { registrations, sessionsStub, workspacesStub } from '../support/shell.js'

const t = createTranslate()

const roots: Root[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount()
    })
  }
  document.body.replaceChildren()
})

/** A client that only records how many times the workbench asked it anything. */
function counting(): { readonly client: ScrumClient; readonly entries: () => number } {
  const inner = disconnectedClient('not connected')
  const entry = vi.fn(inner.entry)
  return { client: { ...inner, entry }, entries: () => entry.mock.calls.length }
}

function shell(
  current: string,
  items: { workspaceId: string; sessionIds: string[]; title?: string }[],
) {
  const store = createScrumModeStore({ initial: 'scrum' })
  const sessions = sessionsStub({ phase: 'ready', current })
  const workspaces = workspacesStub({ items })
  const { client, entries } = counting()
  const overlay = registrations({ store, client }, { sessions, workspaces }).get('shell.overlay')!
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  roots.push(root)
  act(() => {
    root.render(createElement(overlay))
  })
  return { store, sessions, workspaces, entries, host }
}

describe('when the workspace behind the workbench changes', () => {
  it('asks its client again for the new workspace', () => {
    const view = shell('session-a', [{ workspaceId: 'ws-1', sessionIds: ['session-a'] }])
    const before = view.entries()

    // The same session, now accounted for by another workspace: what the
    // workbench is showing no longer belongs to the project it loaded.
    act(() => {
      view.workspaces.publish({ items: [{ workspaceId: 'ws-2', sessionIds: ['session-a'] }] })
    })

    expect(view.entries()).toBe(before + 1)
  })

  it('does not reload for a workspace list that says the same thing again', () => {
    const view = shell('session-a', [{ workspaceId: 'ws-1', sessionIds: ['session-a'] }])
    const before = view.entries()

    act(() => {
      view.workspaces.publish({ items: [{ workspaceId: 'ws-1', sessionIds: ['session-a'] }] })
    })

    expect(view.entries()).toBe(before)
  })

  it('does not borrow the recent workspace for an unaccounted conversation', () => {
    const view = shell('session-a', [{ workspaceId: 'ws-1', sessionIds: ['session-a'] }])
    const before = view.entries()

    act(() => {
      view.workspaces.publish({ items: [], recentWorkspaceId: 'ws-9' })
    })

    expect(view.entries()).toBe(before + 1)
    expect((view.host.querySelector('#scrum-workspace') as HTMLSelectElement).value).toBe('')
    expect(view.host.textContent).toContain(t('topbar.unbound'))
  })

  it('switches from the title bar and keeps Scrum open', () => {
    const view = shell('session-a', [
      { workspaceId: 'ws-1', title: '商城', sessionIds: ['session-a'] },
      { workspaceId: 'ws-2', title: '支付', sessionIds: [] },
    ])
    const picker = view.host.querySelector('#scrum-workspace') as HTMLSelectElement

    expect(picker.value).toBe('ws-1')
    expect(view.host.textContent).toContain(t('topbar.bound'))
    expect(view.host.textContent).toContain('商城')

    act(() => {
      picker.value = 'ws-2'
      picker.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(view.workspaces.started()).toEqual(['ws-2'])

    act(() => {
      view.workspaces.publish({
        items: [
          { workspaceId: 'ws-1', title: '商城', sessionIds: ['session-a'] },
          { workspaceId: 'ws-2', title: '支付', sessionIds: ['session-b'] },
        ],
      })
      view.sessions.publish({ phase: 'ready', current: 'session-b' })
    })

    expect(view.store.mode()).toBe('scrum')
  })
})
