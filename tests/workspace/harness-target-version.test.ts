import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SUPPORTED_HARNESS_RANGE,
  VERIFIED_HARNESS_VERSION,
  isSupportedHarnessVersion,
} from '@dsh-scrum/scrum-harness-host'

// The target version is read by the install probe and the local development
// loop from the root manifest, and by the runtime check from the host package.
// Two copies of a version number drift; this is the guard that they do not.
describe('target harness version', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
    dsh?: { targetHarnessVersion?: string }
  }

  it('has one value shared by the tooling and the runtime check', () => {
    expect(manifest.dsh?.targetHarnessVersion).toBe(VERIFIED_HARNESS_VERSION)
  })

  it('falls inside the range the plugin refuses outside of', () => {
    expect(isSupportedHarnessVersion(VERIFIED_HARNESS_VERSION)).toBe(true)
    expect(SUPPORTED_HARNESS_RANGE).toContain('<0.2.0-0')
  })
})
