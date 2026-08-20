import { createRequire } from 'node:module'
import { satisfies } from 'semver'

/** Package whose version identifies the Harness build: every profile composes it first. */
export const HARNESS_VERSION_PACKAGE = '@deepseek-ai/dsh-base'

/**
 * Supported Harness range, kept in step with the peer dependency and with
 * docs/development/harness-compatibility.md.
 *
 * The upper bound is `<0.2.0-0` rather than `<0.2.0`: prereleases sort before
 * their release, so `0.2.0-rc.1` would otherwise satisfy `<0.2.0` and let a
 * build from the next, potentially breaking, minor through.
 */
export const SUPPORTED_HARNESS_RANGE = '>=0.1.0-rc.7 <0.2.0-0'

/** Highest Harness version this plugin has actually been exercised against. */
export const VERIFIED_HARNESS_VERSION = '0.1.0-rc.7'

/** Reads a package manifest by specifier; injectable so tests need no Harness install. */
export type ManifestReader = (specifier: string) => { version?: unknown }

const readInstalledManifest: ManifestReader = (specifier) =>
  createRequire(import.meta.url)(`${specifier}/package.json`) as { version?: unknown }

export class UnsupportedHarnessVersionError extends Error {
  readonly foundVersion: string
  readonly supportedRange: string

  constructor(foundVersion: string) {
    super(
      `DeepSeek Harness ${foundVersion} is not supported by this Scrum plugin, which requires ${SUPPORTED_HARNESS_RANGE}`,
    )
    this.name = 'UnsupportedHarnessVersionError'
    this.foundVersion = foundVersion
    this.supportedRange = SUPPORTED_HARNESS_RANGE
  }
}

export function isSupportedHarnessVersion(version: string): boolean {
  return satisfies(version, SUPPORTED_HARNESS_RANGE, { includePrerelease: true })
}

/**
 * Version of the Harness this plugin is loaded into, or `undefined` when there
 * is none — a bare Cordis application, or a test. Absence is not a failure:
 * the check exists to refuse a wrong Harness, not to require one.
 */
export function detectHarnessVersion(
  read: ManifestReader = readInstalledManifest,
): string | undefined {
  try {
    const version = read(HARNESS_VERSION_PACKAGE).version
    return typeof version === 'string' ? version : undefined
  } catch {
    return undefined
  }
}

/**
 * Refuses to run against a Harness outside the supported range. Refusing beats
 * degrading: during Developer Preview an interface can change without notice,
 * and continuing would surface the problem far from its cause.
 */
export function assertSupportedHarness(read: ManifestReader = readInstalledManifest): void {
  const version = detectHarnessVersion(read)
  if (version !== undefined && !isSupportedHarnessVersion(version)) {
    throw new UnsupportedHarnessVersionError(version)
  }
}
