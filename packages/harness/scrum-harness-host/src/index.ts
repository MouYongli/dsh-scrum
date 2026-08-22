import { Service, type Context } from '@deepseek-ai/cordis'
import { assertSupportedHarness, type ManifestReader } from './compatibility.js'

/** Name the host service is registered under on the Cordis context. */
export const SCRUM_HOST_SERVICE = 'scrumHost'

/**
 * Host-side entry point for everything the Scrum plugin does outside the
 * browser. The versioned API arrives next; this carries the service itself.
 */
export class ScrumHostService extends Service {
  constructor(ctx: Context) {
    super(ctx, SCRUM_HOST_SERVICE)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    scrumHost: ScrumHostService
  }
}

export const name = 'scrum-harness-host'

/**
 * No host service is required yet. Workspace and session dependencies are
 * declared here once the plugin actually reads them, so that a missing
 * dependency keeps the plugin pending instead of failing halfway through.
 */
export const inject: string[] = []

export interface ScrumHostConfig {
  /**
   * Overrides how the installed Harness manifest is read. A profile never sets
   * this; it exists so a test can drive the load-time refusal path without an
   * actual Harness install to point at.
   */
  readManifest?: ManifestReader
}

export function apply(ctx: Context, config: ScrumHostConfig = {}): void {
  // Checked on load rather than on first use: a wrong Harness should stop the
  // plugin at the point the profile composed it, not halfway through a write.
  assertSupportedHarness(config.readManifest)
  ctx.plugin(ScrumHostService)
}

export type { EntryState } from './entry.js'
export { describeEntry, hostActor } from './entry.js'
export type { HarnessContext, HarnessSession, HarnessWorkspace } from './workspace.js'
export { fingerprintWorkspacePath, sessionBelongsTo, workspaceRefOf } from './workspace.js'
export type { ManifestReader } from './compatibility.js'
export {
  HARNESS_VERSION_PACKAGE,
  SUPPORTED_HARNESS_RANGE,
  UnsupportedHarnessVersionError,
  VERIFIED_HARNESS_VERSION,
  assertSupportedHarness,
  detectHarnessVersion,
  isSupportedHarnessVersion,
} from './compatibility.js'
