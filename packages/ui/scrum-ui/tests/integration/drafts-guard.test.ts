// @vitest-environment jsdom
import { createElement, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { DraftsProvider, createDraftRegistry, useDraftGuard } from '@dsh-scrum/scrum-ui'
import type { DraftRegistry } from '@dsh-scrum/scrum-ui'
import { mount, type Mounted } from '../support/dom.js'

// The hook side: a component reporting for itself, and the registry seeing it
// arrive and go. Static markup shows none of this — the report is an effect.

let open: Mounted | null = null

afterEach(() => {
  open?.unmount()
  open = null
})

/** A form standing in for the real ones: clean until something is typed. */
function Draft(props: { readonly initial: string }): ReturnType<typeof createElement> {
  const [value, setValue] = useState(props.initial)
  useDraftGuard(value !== props.initial)
  return createElement('input', {
    'data-draft': true,
    value,
    onChange: (event: { target: { value: string } }) => {
      setValue(event.target.value)
    },
  })
}

function mountDraft(registry: DraftRegistry, initial = ''): Mounted {
  open = mount(
    createElement(DraftsProvider, { registry }, createElement(Draft, { initial })),
  )
  return open
}

describe('a form reporting its own draft', () => {
  it('reports nothing until the user changes something', () => {
    const registry = createDraftRegistry()

    mountDraft(registry)

    expect(registry.held()).toBe(false)
  })

  it('reports a draft once the user types', () => {
    const registry = createDraftRegistry()
    const form = mountDraft(registry)

    form.type('[data-draft]', 'a coupon story')

    expect(registry.held()).toBe(true)
  })

  it('is clean again when the value returns to what it started as', () => {
    const registry = createDraftRegistry()
    const form = mountDraft(registry)

    form.type('[data-draft]', 'typed')
    form.type('[data-draft]', '')

    expect(registry.held()).toBe(false)
  })

  it('does not report a form that opened over an existing entity', () => {
    const registry = createDraftRegistry()

    // The item drawer seeds its fields from the item. Calling that unsaved
    // would make the question unanswerable: it would never stop being true.
    mountDraft(registry, 'already blocked, waiting on payments')

    expect(registry.held()).toBe(false)
  })

  it('releases its hold when the form goes away', () => {
    const registry = createDraftRegistry()
    const form = mountDraft(registry)
    form.type('[data-draft]', 'typed')

    form.unmount()
    open = null

    expect(registry.held()).toBe(false)
  })

  it('records nothing when no provider carries a registry', () => {
    const registry = createDraftRegistry()

    open = mount(createElement(Draft, { initial: '' }))
    open.type('[data-draft]', 'typed')

    expect(registry.held()).toBe(false)
  })
})
