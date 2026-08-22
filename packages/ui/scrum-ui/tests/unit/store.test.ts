import { describe, expect, it, vi } from 'vitest'
import { createScrumModeStore } from '@dsh-scrum/scrum-ui'

describe('the shell mode store', () => {
  it('starts in the conversation', () => {
    expect(createScrumModeStore().mode()).toBe('conversation')
  })

  it('enters, leaves and toggles between the two modes', () => {
    const store = createScrumModeStore()

    store.enter()
    expect(store.mode()).toBe('scrum')
    store.toggle()
    expect(store.mode()).toBe('conversation')
    store.toggle()
    expect(store.mode()).toBe('scrum')
    store.leave()
    expect(store.mode()).toBe('conversation')
  })

  it('takes the mode it is opened in, so a test does not have to click its way there', () => {
    expect(createScrumModeStore('scrum').mode()).toBe('scrum')
  })

  it('answers with a primitive, so a subscriber can compare snapshots by identity', () => {
    const store = createScrumModeStore()

    // `useSyncExternalStore` compares what `getSnapshot` returns by identity on
    // every pass. A getter assembling an object would re-render forever, and a
    // static render — which never subscribes — would never show it.
    expect(store.mode()).toBe(store.mode())
  })

  it('tells every listener, once per real change', () => {
    const store = createScrumModeStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.enter()
    // Already showing: a repeated enter is not a change, and telling React it
    // was would re-render the whole overlay for nothing.
    store.enter()

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops telling a listener that unsubscribed', () => {
    const store = createScrumModeStore()
    const listener = vi.fn()
    const stop = store.subscribe(listener)

    stop()
    store.enter()

    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps notifying the others when one unsubscribes during a notification', () => {
    const store = createScrumModeStore()
    const second = vi.fn()
    const stop = store.subscribe(() => stop())
    store.subscribe(second)

    store.enter()

    expect(second).toHaveBeenCalledTimes(1)
  })
})
