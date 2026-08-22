/**
 * @vitest-environment jsdom
 *
 * What the shell shows about which mode it is in.
 *
 * The selected state is markup and the focus is not, so this file mounts both
 * registrations in one document: the entry has to be in it for the focus to
 * have somewhere to go back to.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { createScrumModeStore, createTranslate, type ScrumModeStore } from '@dsh-scrum/scrum-ui'
import { registrations } from '../support/shell.js'

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

/** Mounts the sidebar entry and the overlay the way the shell would. */
function shell(store: ScrumModeStore): { readonly entry: HTMLElement; readonly overlay: HTMLElement } {
  const registered = registrations({ store })
  const entry = document.body.appendChild(document.createElement('div'))
  const overlay = document.body.appendChild(document.createElement('div'))
  const entryRoot = createRoot(entry)
  const overlayRoot = createRoot(overlay)
  roots.push(entryRoot, overlayRoot)
  act(() => {
    entryRoot.render(createElement(registered.get('sidebar.footer.action')!, { wide: true }))
    overlayRoot.render(createElement(registered.get('shell.overlay')!))
  })
  return { entry, overlay }
}

function button(entry: HTMLElement): HTMLElement {
  return entry.querySelector<HTMLElement>('[data-scrum-entry="scrum"]')!
}

describe('the sidebar entry', () => {
  it('paints no selection while the shell is in the conversation', () => {
    const { entry } = shell(createScrumModeStore())

    expect(button(entry).style.background).toBe('transparent')
  })

  it('paints itself selected from the shell palette while Scrum is showing', () => {
    const store = createScrumModeStore()
    const { entry } = shell(store)

    act(() => {
      store.enter()
    })

    // Pinned by name: the entry inherits the sidebar's foreground, so a
    // literal band would pair with whatever text colour the theme chose.
    expect(button(entry).style.background).toContain('--dsw-specific-sidebar-nav-item-active')
    expect(button(entry).style.background).not.toContain('#')
  })

  it('says what the next click does, not what the current state is', () => {
    const store = createScrumModeStore()
    const { entry } = shell(store)

    expect(button(entry).getAttribute('aria-label')).toBe(t('entry.open'))
    act(() => {
      store.enter()
    })

    expect(button(entry).getAttribute('aria-label')).toBe(t('entry.leave'))
  })
})

describe('where the focus goes', () => {
  it('follows the user into the workbench, which the sidebar click left behind', () => {
    const store = createScrumModeStore()
    const { entry, overlay } = shell(store)
    button(entry).focus()

    act(() => {
      store.enter()
    })

    expect(document.activeElement).toBe(overlay.querySelector('[data-scrum-workbench]'))
  })

  it('goes back to the entry on the way out, rather than onto a removed element', () => {
    const store = createScrumModeStore()
    const { entry } = shell(store)

    act(() => {
      store.enter()
    })
    act(() => {
      store.leave()
    })

    expect(document.activeElement).toBe(button(entry))
  })

  it('leaves the focus alone on a shell that mounts already in Scrum', () => {
    const store = createScrumModeStore({ initial: 'scrum' })

    const { overlay } = shell(store)

    // Nobody navigated anywhere, so nothing may be taken from wherever the
    // shell put the focus while it was loading.
    expect(document.activeElement).not.toBe(overlay.querySelector('[data-scrum-workbench]'))
  })
})
