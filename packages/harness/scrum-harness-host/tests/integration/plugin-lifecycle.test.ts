import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as hostPlugin from '@dsh-scrum/scrum-harness-host'

// Loaded into a real Cordis context rather than a stub: the plugin contract
// this package depends on is Cordis, and the Harness composes the same
// registry underneath.
describe('scrum host plugin', () => {
  it('registers its service when loaded', async () => {
    const ctx = new Context()
    await ctx.plugin(hostPlugin)

    expect(ctx.scrumHost).toBeDefined()
    expect(ctx.scrumHost.name).toBe('scrumHost')
  })

  it('leaves nothing behind when unloaded', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(hostPlugin)

    await fiber.dispose()

    expect(ctx.get('scrumHost')).toBeUndefined()
  })

  it('can be loaded again after being unloaded', async () => {
    const ctx = new Context()

    await (await ctx.plugin(hostPlugin)).dispose()
    await ctx.plugin(hostPlugin)

    expect(ctx.scrumHost).toBeDefined()
  })

  it('declares the plugin name the profile patch addresses it by', () => {
    expect(hostPlugin.name).toBe('scrum-harness-host')
  })
})
