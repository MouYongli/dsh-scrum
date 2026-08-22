import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createTranslate, createWorkbenchStore, type WorkbenchStore } from '@dsh-scrum/scrum-ui'
import * as clientEntry from '@dsh-scrum/scrum-harness-client/client'

interface Registered {
  readonly name: string
  readonly component: ComponentType<Record<string, unknown>>
}

/** Applies the plugin against a registry that declares both slots at once. */
function registrations(store: WorkbenchStore): Map<string, Registered> {
  const found = new Map<string, Registered>()
  const ctx = {
    slots: {
      inject: (_name: string, callback: () => void) => callback(),
      register: (spec: { name: string }, component: ComponentType<Record<string, unknown>>) => {
        found.set(spec.name, { name: spec.name, component })
        return () => undefined
      },
    },
  }
  clientEntry.apply(ctx as never, { store } as never)
  return found
}

function render(component: ComponentType<Record<string, unknown>>, props = {}): string {
  return renderToStaticMarkup(createElement(component, props))
}

const t = createTranslate()

describe('the sidebar entry', () => {
  it('shows its label when the sidebar is wide', () => {
    const store = createWorkbenchStore()
    const entry = registrations(store).get('sidebar.footer.action')!

    expect(render(entry.component, { wide: true })).toContain(t('entry.label'))
  })

  it('falls back to the icon on the collapsed rail, keeping its accessible name', () => {
    const store = createWorkbenchStore()
    const markup = render(registrations(store).get('sidebar.footer.action')!.component, {
      wide: false,
    })

    expect(markup).not.toContain(`>${t('entry.label')}<`)
    expect(markup).toContain(`aria-label="${t('entry.open')}"`)
  })

  it('reports whether the workbench is open', () => {
    const store = createWorkbenchStore()
    const entry = registrations(store).get('sidebar.footer.action')!

    expect(render(entry.component, { wide: true })).toContain('aria-pressed="false"')
    store.open()
    expect(render(entry.component, { wide: true })).toContain('aria-pressed="true"')
  })
})

describe('the overlay', () => {
  it('renders nothing at all while closed, so it is not a layer over the conversation', () => {
    const store = createWorkbenchStore()
    const overlay = registrations(store).get('shell.overlay')!

    expect(render(overlay.component)).toBe('')
  })

  it('renders the workbench once opened', () => {
    const store = createWorkbenchStore()
    const overlay = registrations(store).get('shell.overlay')!
    store.open()

    const markup = render(overlay.component)

    expect(markup).toContain('data-scrum-overlay="scrum"')
    expect(markup).toContain('role="dialog"')
  })

  it('paints itself from the shell palette, so the inherited text stays legible', () => {
    const store = createWorkbenchStore()
    const overlay = registrations(store).get('shell.overlay')!
    store.open()

    const markup = render(overlay.component)

    // Pinned by name: the overlay covers the shell and inherits its foreground,
    // so a background the shell does not publish falls back to a literal and
    // pairs, on the dark theme, near-white text with a white surface.
    expect(markup).toContain('var(--dsw-alias-bg-base, Canvas)')
    expect(markup).not.toContain('#fff')
  })

  it('says it is not connected when nothing composed a client', () => {
    const store = createWorkbenchStore()
    const overlay = registrations(store).get('shell.overlay')!
    store.open()

    // The workbench opens and reports the problem rather than the entry doing
    // nothing when clicked, which is a state nobody can report.
    expect(render(overlay.component)).toContain('aria-busy="true"')
  })
})
