import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as hostPlugin from '@dsh-scrum/scrum-harness-host'
import { HOST_API_VERSION } from '@dsh-scrum/scrum-harness-host'
import { MemoryStore, harness, runtime } from '../support/runtime.js'

// The client is built and shipped separately from the host, so the two can be
// different builds. A mismatch has to fail where it is asked for, naming both
// numbers, rather than as a method that turns out not to be there.

describe('the versioned host api', () => {
  it('hands out the api at the version it implements', async () => {
    const ctx = new Context()
    await ctx.plugin(hostPlugin, { harness: harness(), runtime: runtime(new MemoryStore()) })

    expect(ctx.scrumHost.api(HOST_API_VERSION).version).toBe(HOST_API_VERSION)
    expect(ctx.scrumHost.api().version).toBe(HOST_API_VERSION)
  })

  it('refuses a version it does not implement, and says both numbers', async () => {
    const ctx = new Context()
    await ctx.plugin(hostPlugin, { harness: harness(), runtime: runtime(new MemoryStore()) })

    const error = (() => {
      try {
        ctx.scrumHost.api(HOST_API_VERSION + 1)
      } catch (caught: unknown) {
        return caught as { code?: string; details?: Record<string, unknown> }
      }
      return null
    })()

    expect(error?.code).toBe('VALIDATION')
    expect(error?.details).toMatchObject({
      requested: HOST_API_VERSION + 1,
      implemented: HOST_API_VERSION,
    })
  })

  it('refuses to hand out an api when nothing composed a Harness context', async () => {
    const ctx = new Context()
    await ctx.plugin(hostPlugin)

    expect(() => ctx.scrumHost.api()).toThrow(/composed without a Harness context/)
  })
})
