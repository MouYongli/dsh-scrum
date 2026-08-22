import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * Mounts a component in a real document and drives it.
 *
 * The render tests assert what a state draws; these assert what an
 * interaction does, which static markup cannot show — `renderToStaticMarkup`
 * never invokes a handler, so every `onClick` and `onChange` in this package
 * is a function no assertion has ever executed.
 *
 * Files using this must select the DOM environment with a docblock:
 * `@vitest-environment jsdom` at the top of the file.
 */
export interface Mounted {
  readonly container: HTMLElement
  readonly click: (selector: string) => void
  readonly type: (selector: string, value: string) => void
  readonly choose: (selector: string, value: string) => void
  readonly toggle: (selector: string) => void
  readonly submit: (selector: string) => void
  readonly find: (selector: string) => HTMLElement
  readonly all: (selector: string) => readonly HTMLElement[]
  readonly render: (next: ReactElement) => void
  readonly unmount: () => void
}

function required(container: HTMLElement, selector: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(selector)
  if (element === null) {
    throw new Error(`no element matched ${selector}`)
  }
  return element
}

/**
 * React's own act, so effects and state updates settle before an assertion.
 * Without it a click would be asserted against the render that preceded it.
 */
function flush(run: () => void): void {
  act(run)
}

export function mount(element: ReactElement): Mounted {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root: Root
  flush(() => {
    root = createRoot(container)
    root.render(element)
  })

  function set(node: HTMLElement, value: string): void {
    // React tracks the previous value on the node and swallows an input event
    // whose value it believes it already knows, so the tracker is bypassed the
    // way every React testing library does it.
    const prototype = Object.getPrototypeOf(node) as object
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    setter?.call(node, value)
  }

  return {
    container,
    find: (selector) => required(container, selector),
    all: (selector) => [...container.querySelectorAll<HTMLElement>(selector)],
    click: (selector) => {
      flush(() => {
        required(container, selector).dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true }),
        )
      })
    },
    type: (selector, value) => {
      flush(() => {
        const node = required(container, selector)
        set(node, value)
        node.dispatchEvent(new Event('input', { bubbles: true }))
      })
    },
    choose: (selector, value) => {
      flush(() => {
        const node = required(container, selector)
        set(node, value)
        node.dispatchEvent(new Event('change', { bubbles: true }))
      })
    },
    /**
     * A real click, letting the document flip the box itself. Assigning
     * `checked` first and dispatching afterwards is what does not work:
     * React tracks the previous checked state and treats an event that only
     * reports what it already believes as nothing having happened.
     */
    toggle: (selector) => {
      flush(() => {
        required(container, selector).dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true }),
        )
      })
    },
    submit: (selector) => {
      flush(() => {
        required(container, selector).dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        )
      })
    },
    render: (next) => {
      flush(() => {
        root.render(next)
      })
    },
    unmount: () => {
      flush(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}
