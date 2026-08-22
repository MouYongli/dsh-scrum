/**
 * @vitest-environment jsdom
 *
 * Where the overlay sits, in a document.
 *
 * The geometry is measured rather than declared, so static markup cannot show
 * it: `renderToStaticMarkup` never runs the ref or the effect that do the
 * measuring. jsdom has no layout engine either, so each participating element
 * is given the rectangle it would have in a shell — the assertion is about the
 * arithmetic and the walk, not about a browser's box model.
 */
import { act, createElement, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { createWorkbenchStore, type WorkbenchStore } from '@dsh-scrum/scrum-ui'
import * as clientEntry from '@dsh-scrum/scrum-harness-client/client'

interface Registered {
  readonly component: ComponentType<Record<string, unknown>>
}

function registrations(store: WorkbenchStore): Map<string, Registered> {
  const found = new Map<string, Registered>()
  const ctx = {
    slots: {
      inject: (_name: string, callback: () => void) => callback(),
      register: (spec: { name: string }, component: ComponentType<Record<string, unknown>>) => {
        found.set(spec.name, { component })
        return () => undefined
      },
    },
  }
  clientEntry.apply(ctx as never, { store } as never)
  return found
}

/** Gives one element the rectangle it would have in a laid-out shell. */
function rect(element: Element, box: { left: number; right: number }): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ ...box, top: 0, bottom: 0, width: box.right - box.left, height: 0 }),
    configurable: true,
  })
}

const roots: Root[] = []

/**
 * A `ResizeObserver` that reports when asked to.
 *
 * jsdom ships none, and the real one only fires on a layout the environment
 * never performs. Installing this is what lets the drag and the collapse be
 * asserted rather than assumed: the shell resizes the column, the observer
 * reports, and the overlay is expected to have moved with it.
 */
function installResizeObserver(): { readonly resize: () => void } {
  const callbacks: (() => void)[] = []
  class Stub {
    constructor(callback: () => void) {
      callbacks.push(callback)
    }
    observe(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { value: Stub, configurable: true })
  return {
    resize: () =>
      act(() => {
        for (const callback of callbacks) {
          callback()
        }
      }),
  }
}

/**
 * The host frame as the layout plugin builds it: a sidebar column and the
 * overlay layer, side by side under one frame. Both registrations are mounted
 * where the shell would mount them, because the overlay finds the column by
 * walking up from the entry.
 */
function mountShell(options: { sidebarRight: number; layerLeft: number; withEntry?: boolean }): {
  readonly store: WorkbenchStore
  readonly column: HTMLElement
  readonly overlay: () => HTMLElement | null
} {
  const store = createWorkbenchStore()
  const registered = registrations(store)
  const frame = document.createElement('div')
  const column = document.createElement('div')
  const layer = document.createElement('div')
  layer.setAttribute('data-shell-overlay', 'true')
  frame.append(column, layer)
  document.body.append(frame)
  rect(column, { left: 0, right: options.sidebarRight })
  rect(layer, { left: options.layerLeft, right: 1400 })

  act(() => {
    store.open()
    if (options.withEntry !== false) {
      const entry = createRoot(column)
      roots.push(entry)
      entry.render(
        createElement(registered.get('sidebar.footer.action')!.component, { wide: true }),
      )
    }
    const overlay = createRoot(layer)
    roots.push(overlay)
    overlay.render(createElement(registered.get('shell.overlay')!.component))
  })

  return {
    store,
    column,
    overlay: () => document.querySelector<HTMLElement>('[data-scrum-overlay]'),
  }
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) {
      root.unmount()
    }
  })
  document.body.innerHTML = ''
  Reflect.deleteProperty(globalThis, 'ResizeObserver')
})

describe('the overlay geometry', () => {
  it('starts at the sidebar right edge, so the column stays visible', () => {
    const shell = mountShell({ sidebarRight: 280, layerLeft: 0 })

    expect(shell.overlay()!.style.left).toBe('280px')
  })

  it('measures in the layer own coordinates rather than the viewport', () => {
    // The frame does not have to start at the left edge of the window; a
    // desktop shell can put chrome beside it.
    const shell = mountShell({ sidebarRight: 300, layerLeft: 40 })

    expect(shell.overlay()!.style.left).toBe('260px')
  })

  it('leaves the collapsed rail visible', () => {
    const shell = mountShell({ sidebarRight: 56, layerLeft: 0 })

    expect(shell.overlay()!.style.left).toBe('56px')
  })

  it('covers the frame when no column can be found, rather than guessing', () => {
    // A shell that never rendered the entry: better a workbench over the whole
    // frame than one indented by a number nobody measured.
    const shell = mountShell({ sidebarRight: 280, layerLeft: 0, withEntry: false })

    expect(shell.overlay()!.style.left).toBe('0px')
  })

  it('follows the sidebar when it is dragged or collapsed', () => {
    const observer = installResizeObserver()
    const shell = mountShell({ sidebarRight: 280, layerLeft: 0 })
    const overlay = shell.overlay()!
    expect(overlay.style.left).toBe('280px')

    // What a drag does: the column is resized, and the observer reports it.
    rect(shell.column, { left: 0, right: 360 })
    observer.resize()

    expect(shell.overlay()!.style.left).toBe('360px')
  })

  it('keeps the other three edges on the frame', () => {
    const overlay = mountShell({ sidebarRight: 280, layerLeft: 0 }).overlay()!

    expect(overlay.style.top).toBe('0px')
    expect(overlay.style.right).toBe('0px')
    expect(overlay.style.bottom).toBe('0px')
  })
})
