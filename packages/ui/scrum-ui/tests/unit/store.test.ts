import { describe, expect, it, vi } from 'vitest'
import { createDraftRegistry, createScrumModeStore } from '@dsh-scrum/scrum-ui'
import type { DraftRegistry } from '@dsh-scrum/scrum-ui'

/** A store showing Scrum over a form the user has half filled in. */
function asked(): { store: ReturnType<typeof createScrumModeStore>; drafts: DraftRegistry } {
  const drafts = createDraftRegistry()
  const store = createScrumModeStore({ initial: 'scrum', drafts })
  return { store, drafts }
}

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
    expect(createScrumModeStore({ initial: 'scrum' }).mode()).toBe('scrum')
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

describe('leaving with unsaved work', () => {
  it('goes straight back when nothing is half typed', () => {
    const { store } = asked()

    store.leave()

    expect(store.mode()).toBe('conversation')
    expect(store.leaving()).toBe(false)
  })

  it('asks instead of leaving, and stays in Scrum while it asks', () => {
    const { store, drafts } = asked()
    drafts.hold()

    store.leave()

    // The forms holding the drafts are in the overlay's subtree, which renders
    // nothing in conversation mode. Switching first would take away the thing
    // being asked about.
    expect(store.leaving()).toBe(true)
    expect(store.mode()).toBe('scrum')
  })

  it('leaves when the answer is to discard', () => {
    const { store, drafts } = asked()
    drafts.hold()
    store.leave()

    store.discard()

    expect(store.mode()).toBe('conversation')
    expect(store.leaving()).toBe(false)
  })

  it('stays put when the answer is to keep editing', () => {
    const { store, drafts } = asked()
    drafts.hold()
    store.leave()

    store.resume()

    expect(store.mode()).toBe('scrum')
    expect(store.leaving()).toBe(false)
  })

  it('does not ask twice while it is already asking', () => {
    const { store, drafts } = asked()
    drafts.hold()
    store.leave()
    const listener = vi.fn()
    store.subscribe(listener)

    store.leave()

    expect(listener).not.toHaveBeenCalled()
    expect(store.mode()).toBe('scrum')
  })

  it('finishes the leave when the form behind the question is dealt with', () => {
    const { store, drafts } = asked()
    const release = drafts.hold()
    store.leave()

    release()

    // The question outlived what it was about. Keeping it up would ask about
    // nothing, and answering it would return to an empty form.
    expect(store.mode()).toBe('conversation')
    expect(store.leaving()).toBe(false)
  })

  it('does not pull out someone who chose to keep editing and then saved', () => {
    const { store, drafts } = asked()
    const release = drafts.hold()
    store.leave()
    store.resume()

    release()

    expect(store.mode()).toBe('scrum')
  })

  it('takes a second click on the entry as the answer to keep editing', () => {
    const { store, drafts } = asked()
    drafts.hold()
    store.leave()

    store.toggle()

    expect(store.mode()).toBe('scrum')
    expect(store.leaving()).toBe(false)
  })

  it('drops the question when the shell is entered again', () => {
    const { store, drafts } = asked()
    drafts.hold()
    store.leave()

    store.enter()

    expect(store.leaving()).toBe(false)
  })

  it('never asks when nothing hands it a registry', () => {
    const store = createScrumModeStore({ initial: 'scrum' })

    store.leave()

    expect(store.mode()).toBe('conversation')
  })
})
