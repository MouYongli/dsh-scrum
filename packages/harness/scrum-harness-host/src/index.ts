import { Service, type Context } from '@deepseek-ai/cordis'
import { ValidationError } from '@dsh-scrum/scrum-domain'
import {
  HOST_API_VERSION,
  UnsupportedHostApiVersionError,
  createHostApi,
  type ScrumHostApi,
  type ScrumRuntime,
} from './api.js'
import { createAgentApi, type ScrumAgentApi } from './agent-api.js'
import { assertSupportedHarness, type ManifestReader } from './compatibility.js'
import type { HarnessContext } from './workspace.js'

/** Name the host service is registered under on the Cordis context. */
export const SCRUM_HOST_SERVICE = 'scrumHost'

/**
 * Host-side entry point for everything the Scrum plugin does outside the
 * browser.
 *
 * The use cases are reachable only through `api(version)`. The client runs in
 * a browser and cannot open a file, and the agent tools go through the same
 * door, so there is one place where the workspace, the session and the actor
 * are resolved and one place a rule can be enforced.
 */
export class ScrumHostService extends Service {
  private readonly harness: HarnessContext | undefined
  private readonly runtime: ScrumRuntime | undefined

  constructor(ctx: Context, config: ScrumHostConfig = {}) {
    super(ctx, SCRUM_HOST_SERVICE)
    this.harness = config.harness
    this.runtime = config.runtime
  }

  /**
   * The API as one agent session sees it: the same calls, narrowed by what
   * that session was given. A tool never reaches `api()` directly, so the
   * session rule cannot be skipped by forgetting to apply it.
   */
  agentApi(sessionId: string, version: number = HOST_API_VERSION): ScrumAgentApi {
    const api = this.api(version)
    if (this.harness === undefined || this.runtime === undefined) {
      throw new ValidationError('the Scrum host was composed without a Harness context', {})
    }
    return createAgentApi(this.harness, this.runtime, api, sessionId)
  }

  /**
   * The API at the requested version.
   *
   * The version is checked here rather than left to a missing method, because
   * the client is built and shipped separately from the host and a mismatch
   * has to say both numbers.
   */
  api(version: number = HOST_API_VERSION): ScrumHostApi {
    if (version !== HOST_API_VERSION) {
      throw new UnsupportedHostApiVersionError(version)
    }
    if (this.harness === undefined || this.runtime === undefined) {
      throw new ValidationError('the Scrum host was composed without a Harness context', {
        harness: this.harness !== undefined,
        runtime: this.runtime !== undefined,
      })
    }
    return createHostApi(this.harness, this.runtime)
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
  /**
   * Where the workspace, the session and the instance come from. Supplied by
   * the edition bundle, which knows how to read them from the Harness it was
   * composed into; absent in a bare Cordis application, where the plugin loads
   * but has nothing to act on.
   */
  harness?: HarnessContext
  /** The identity and the stores. Supplied by the edition bundle. */
  runtime?: ScrumRuntime
}

export function apply(ctx: Context, config: ScrumHostConfig = {}): void {
  // Checked on load rather than on first use: a wrong Harness should stop the
  // plugin at the point the profile composed it, not halfway through a write.
  assertSupportedHarness(config.readManifest)
  ctx.plugin(ScrumHostService, config)
}

export type {
  HostRequestContext,
  InitialiseWorkspaceCommand,
  ScrumHostApi,
  ScrumRuntime,
} from './api.js'
export { HOST_API_VERSION, UnsupportedHostApiVersionError, createHostApi } from './api.js'
export type { ScrumAgentApi } from './agent-api.js'
export { createAgentApi } from './agent-api.js'
export type { ApiForScope, ChannelHandler, ChannelResult } from './channel.js'
export { createChannelHandler } from './channel.js'
export type { HarnessDirectory } from './directory.js'
export { fingerprintInstanceId, scopedHarness } from './directory.js'
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
