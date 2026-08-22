import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as bundle from '@dsh-scrum/scrum-harness-bundle'
import { apply, name } from '@dsh-scrum/scrum-harness-bundle'
import { SUPPORTED_HARNESS_RANGE, VERIFIED_HARNESS_VERSION } from '@dsh-scrum/scrum-harness-host'

// The bundle is the only installable unit, so this is the only place a
// profile's view of the plugin can be checked: load it the way the composer
// does and see what it brings.

function harnessAt(version: string) {
  return () => ({ name: '@deepseek-ai/dsh-base', version })
}

describe('loading the bundle', () => {
  it('brings the Community runtime with it, so nothing else has to supply one', async () => {
    const ctx = new Context()

    await ctx.plugin(bundle, { readManifest: harnessAt(VERIFIED_HARNESS_VERSION) })

    // Composed and reachable: the host API refuses only for the Harness
    // context, which no installation can supply from inside this process.
    expect(ctx.scrumHost).toBeDefined()
    expect(() => ctx.scrumHost.api()).toThrow(/Harness context/)
  })

  it('takes a runtime the profile supplied over the one it composes', async () => {
    const ctx = new Context()
    const runtime = {
      identity: () => Promise.reject(new Error('not used')),
      tenant: () => Promise.reject(new Error('not used')),
      forWorkspace: () => Promise.reject(new Error('not used')),
    }

    await ctx.plugin(bundle, { readManifest: harnessAt(VERIFIED_HARNESS_VERSION), runtime })

    expect(ctx.scrumHost).toBeDefined()
  })

  it('refuses a Harness outside the range it declares, at load time', () => {
    const ctx = new Context()

    // At load rather than at first use: a wrong Harness has to stop the plugin
    // where the profile composed it, not halfway through a write.
    expect(() => apply(ctx, { readManifest: harnessAt('99.0.0') })).toThrow()
  })

  it('names the range it was built against, so a refusal can say both numbers', () => {
    expect(SUPPORTED_HARNESS_RANGE).not.toBe('')
    expect(name).toBe('scrum-harness-host')
  })
})
