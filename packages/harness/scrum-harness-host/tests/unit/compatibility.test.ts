import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as hostPlugin from '@dsh-scrum/scrum-harness-host'
import {
  HARNESS_VERSION_PACKAGE,
  SUPPORTED_HARNESS_RANGE,
  UnsupportedHarnessVersionError,
  VERIFIED_HARNESS_VERSION,
  assertSupportedHarness,
  detectHarnessVersion,
  isSupportedHarnessVersion,
  type ManifestReader,
} from '@dsh-scrum/scrum-harness-host'

function harnessAt(version: unknown): ManifestReader {
  return (specifier) => {
    expect(specifier).toBe(HARNESS_VERSION_PACKAGE)
    return { version }
  }
}

const noHarness: ManifestReader = () => {
  throw new Error("Cannot find module '@deepseek-ai/dsh-base/package.json'")
}

describe('supported harness range', () => {
  it('accepts the verified version and later releases of the same minor', () => {
    expect(isSupportedHarnessVersion(VERIFIED_HARNESS_VERSION)).toBe(true)
    for (const version of ['0.1.0-rc.7', '0.1.0-rc.8', '0.1.0-rc.10', '0.1.0', '0.1.5']) {
      expect(isSupportedHarnessVersion(version)).toBe(true)
    }
  })

  it('refuses older prereleases and the next minor, including its prereleases', () => {
    for (const version of ['0.0.1-rc.1', '0.1.0-rc.6', '0.2.0-rc.1', '0.2.0', '1.0.0']) {
      expect(isSupportedHarnessVersion(version)).toBe(false)
    }
  })

  it('states the range it enforces, so the message can name it', () => {
    expect(SUPPORTED_HARNESS_RANGE).toBe('>=0.1.0-rc.7 <0.2.0-0')
  })
})

describe('harness detection', () => {
  it('reads the version of the package every profile composes first', () => {
    expect(detectHarnessVersion(harnessAt('0.1.0-rc.7'))).toBe('0.1.0-rc.7')
  })

  it('reports no harness when the package is absent or malformed', () => {
    expect(detectHarnessVersion(noHarness)).toBeUndefined()
    expect(detectHarnessVersion(harnessAt(undefined))).toBeUndefined()
    expect(detectHarnessVersion(harnessAt(7))).toBeUndefined()
  })
})

describe('load-time refusal', () => {
  it('names both the version found and the range required', () => {
    try {
      assertSupportedHarness(harnessAt('0.2.0'))
      expect.unreachable('0.2.0 must be refused')
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedHarnessVersionError)
      const refusal = error as UnsupportedHarnessVersionError
      expect(refusal.foundVersion).toBe('0.2.0')
      expect(refusal.supportedRange).toBe(SUPPORTED_HARNESS_RANGE)
      expect(refusal.message).toContain('0.2.0')
      expect(refusal.message).toContain(SUPPORTED_HARNESS_RANGE)
    }
  })

  it('passes for a supported harness', () => {
    expect(() => assertSupportedHarness(harnessAt('0.1.0-rc.7'))).not.toThrow()
  })

  it('does not require a harness at all, so bare Cordis still loads the plugin', async () => {
    expect(() => assertSupportedHarness(noHarness)).not.toThrow()

    // The reader is injected: the workspace has a real dsh-base installed, so
    // loading with the default reader would pass because that version is in
    // range — not because absence is tolerated, which is what this case is for.
    const ctx = new Context()
    await ctx.plugin(hostPlugin, { readManifest: noHarness })

    expect(ctx.scrumHost).toBeDefined()
  })

  it('refuses to load the plugin against a harness outside the range', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(hostPlugin, { readManifest: harnessAt('0.2.0') })

    await expect(fiber.await()).rejects.toBeInstanceOf(UnsupportedHarnessVersionError)
    expect(ctx.get('scrumHost')).toBeUndefined()
  })
})
