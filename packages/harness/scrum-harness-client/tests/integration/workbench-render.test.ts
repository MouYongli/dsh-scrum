import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createTranslate, createScrumModeStore, type ScrumModeStore } from '@dsh-scrum/scrum-ui'
import { registrations as registered } from '../support/shell.js'
import { topbarMessage } from '@dsh-scrum/scrum-harness-client/client'

/** Applies the plugin against a registry that declares both slots at once. */
function registrations(store: ScrumModeStore): ReturnType<typeof registered> {
  return registered({ store })
}

function render(component: ComponentType<Record<string, unknown>>, props = {}): string {
  return renderToStaticMarkup(createElement(component, props))
}

const t = createTranslate()

describe('the sidebar entry', () => {
  it('shows its label when the sidebar is wide', () => {
    const store = createScrumModeStore()
    const entry = registrations(store).get('sidebar.footer.action')!

    expect(render(entry, { wide: true })).toContain(t('entry.label'))
  })

  it('falls back to the icon on the collapsed rail, keeping its accessible name', () => {
    const store = createScrumModeStore()
    const markup = render(registrations(store).get('sidebar.footer.action')!, {
      wide: false,
    })

    expect(markup).not.toContain(`>${t('entry.label')}<`)
    expect(markup).toContain(`aria-label="${t('entry.open')}"`)
  })

  it('reports which mode the shell is in', () => {
    const store = createScrumModeStore()
    const entry = registrations(store).get('sidebar.footer.action')!

    expect(render(entry, { wide: true })).toContain('aria-pressed="false"')
    store.enter()
    expect(render(entry, { wide: true })).toContain('aria-pressed="true"')
  })
})

describe('the overlay', () => {
  it('keeps one project-management title whenever a workspace is selected', () => {
    expect(topbarMessage(null, 'ws-1')).toBe('topbar.bound')
    expect(
      topbarMessage({ state: 'unbound', workspace: { id: 'ws-1', name: 'YouTube_DSH' } }, 'ws-1'),
    ).toBe('topbar.bound')
    expect(topbarMessage(null, null)).toBe('topbar.unbound')
  })

  it('renders nothing in conversation mode, so it is not a layer over it', () => {
    const store = createScrumModeStore()
    const overlay = registrations(store).get('shell.overlay')!

    expect(render(overlay)).toBe('')
  })

  it('renders the workbench in Scrum mode', () => {
    const store = createScrumModeStore()
    const overlay = registrations(store).get('shell.overlay')!
    store.enter()

    const markup = render(overlay)

    expect(markup).toContain('data-scrum-overlay="scrum"')
    expect(markup).toContain('role="region"')
  })

  it('paints itself from the shell palette, so the inherited text stays legible', () => {
    const store = createScrumModeStore()
    const overlay = registrations(store).get('shell.overlay')!
    store.enter()

    const markup = render(overlay)

    // Pinned by name: the overlay covers the shell and inherits its foreground,
    // so a background the shell does not publish falls back to a literal and
    // pairs, on the dark theme, near-white text with a white surface.
    expect(markup).toContain('var(--dsw-alias-bg-base, Canvas)')
    expect(markup).not.toContain('#fff')
  })

  it('aligns the shared topbar with the conversation banner', () => {
    const store = createScrumModeStore()
    const overlay = registrations(store).get('shell.overlay')!
    store.enter()

    const markup = render(overlay)

    expect(markup).toContain('[data-scrum-workbench] &gt; [data-scrum-topbar]')
    expect(markup).toContain('justify-content: flex-start')
    expect(markup).toContain('padding: 12px 28px 0;')
    expect(markup).toContain('position: absolute')
    expect(markup).toContain('top: 12px')
    expect(markup).toContain('right: 28px')
    expect(markup).toContain('height: 28px')
  })

  it('says it is not connected when nothing composed a client', () => {
    const store = createScrumModeStore()
    const overlay = registrations(store).get('shell.overlay')!
    store.enter()

    // The workbench opens and reports the problem rather than the entry doing
    // nothing when clicked, which is a state nobody can report.
    expect(render(overlay)).toContain('aria-busy="true"')
  })
})
