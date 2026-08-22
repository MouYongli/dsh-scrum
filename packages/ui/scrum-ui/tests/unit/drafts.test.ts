import { describe, expect, it, vi } from 'vitest'
import { NO_DRAFTS, createDraftRegistry } from '@dsh-scrum/scrum-ui'

describe('the draft registry', () => {
  it('holds nothing until a form says otherwise', () => {
    expect(createDraftRegistry().held()).toBe(false)
  })

  it('counts holds, so one form releasing does not answer for another', () => {
    const registry = createDraftRegistry()
    const first = registry.hold()
    registry.hold()

    first()

    // The second form is still half filled in; a boolean would have said the
    // workbench was clean here.
    expect(registry.held()).toBe(true)
  })

  it('reports clean once the last hold goes', () => {
    const registry = createDraftRegistry()
    const release = registry.hold()

    release()

    expect(registry.held()).toBe(false)
  })

  it('ignores a release called twice, rather than dropping somebody else’s hold', () => {
    const registry = createDraftRegistry()
    const release = registry.hold()
    registry.hold()

    release()
    release()

    expect(registry.held()).toBe(true)
  })

  it('tells its listeners on the edges only', () => {
    const registry = createDraftRegistry()
    const listener = vi.fn()
    registry.subscribe(listener)

    const first = registry.hold()
    const second = registry.hold()
    expect(listener).toHaveBeenCalledTimes(1)

    first()
    expect(listener).toHaveBeenCalledTimes(1)
    second()

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stops telling a listener that unsubscribed', () => {
    const registry = createDraftRegistry()
    const listener = vi.fn()
    const stop = registry.subscribe(listener)

    stop()
    registry.hold()

    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps notifying the others when one unsubscribes during a notification', () => {
    const registry = createDraftRegistry()
    const second = vi.fn()
    const stop = registry.subscribe(() => stop())
    registry.subscribe(second)

    registry.hold()

    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('the registry that records nothing', () => {
  it('answers clean whatever is reported to it, so a form needs no provider', () => {
    NO_DRAFTS.hold()()

    expect(NO_DRAFTS.held()).toBe(false)
    expect(NO_DRAFTS.subscribe(() => undefined)()).toBeUndefined()
  })
})
