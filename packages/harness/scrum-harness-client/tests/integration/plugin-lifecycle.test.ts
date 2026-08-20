import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as clientPlugin from '@dsh-scrum/scrum-harness-client'

class SlotsStub extends Service {
  constructor(ctx: Context) {
    super(ctx, 'slots')
  }
}

describe('scrum client plugin', () => {
  it('stays pending while the slot registry is missing', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(clientPlugin)

    // Settled first: apply() is always deferred by at least a microtask, so
    // asserting synchronously would pass even with the inject gate removed.
    await fiber.await()

    expect(ctx.get('scrumClient')).toBeUndefined()
  })

  it('activates once the slot registry appears, and deactivates when it goes', async () => {
    const ctx = new Context()
    ctx.plugin(clientPlugin)

    const slots = await ctx.plugin(SlotsStub)
    expect(ctx.scrumClient).toBeDefined()

    await slots.dispose()
    expect(ctx.get('scrumClient')).toBeUndefined()
  })

  it('declares the dependency that gates it', () => {
    expect(clientPlugin.inject).toEqual(['slots'])
    expect(clientPlugin.name).toBe('scrum-harness-client')
  })
})
