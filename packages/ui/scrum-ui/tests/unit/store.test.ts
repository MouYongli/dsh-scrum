import { describe, expect, it, vi } from 'vitest'
import { createWorkbenchStore } from '@dsh-scrum/scrum-ui'

describe('the workbench store', () => {
  it('starts closed', () => {
    expect(createWorkbenchStore().isOpen()).toBe(false)
  })

  it('opens, closes and toggles', () => {
    const store = createWorkbenchStore()

    store.open()
    expect(store.isOpen()).toBe(true)
    store.toggle()
    expect(store.isOpen()).toBe(false)
    store.close()
    expect(store.isOpen()).toBe(false)
  })

  it('tells every listener, once per real change', () => {
    const store = createWorkbenchStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.open()
    // Already open: a repeated open is not a change, and telling React it was
    // would re-render the whole overlay for nothing.
    store.open()

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops telling a listener that unsubscribed', () => {
    const store = createWorkbenchStore()
    const listener = vi.fn()
    const stop = store.subscribe(listener)

    stop()
    store.open()

    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps notifying the others when one unsubscribes during a notification', () => {
    const store = createWorkbenchStore()
    const second = vi.fn()
    const stop = store.subscribe(() => stop())
    store.subscribe(second)

    store.open()

    expect(second).toHaveBeenCalledTimes(1)
  })
})
