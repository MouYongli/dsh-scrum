/**
 * Installable bundle for the DeepSeek Harness: the node half of the plugin,
 * plus `cordis.patch.yml`, which the profile composer resolves through the
 * `dsh.bundle.patch` manifest field.
 *
 * The plugin lives in `@dsh-scrum/scrum-harness-host`; this package composes it
 * with the Community edition and re-exports the result, because a patch row's
 * package name is resolved from the profile directory, where only the
 * installed bundle exists.
 *
 * Composing here rather than in the host is the whole point of the layering:
 * the host knows what it needs — an identity, a tenant and the stores — and
 * this is the one place that decides those come from the local workspace
 * rather than from a service.
 *
 * @module @dsh-scrum/scrum-harness-bundle
 */
import type { Context } from '@deepseek-ai/cordis'
import { createCommunityRuntime } from '@dsh-scrum/edition-community'
import { apply as applyHost, type ScrumHostConfig } from '@dsh-scrum/scrum-harness-host'

export { inject, name } from '@dsh-scrum/scrum-harness-host'

/**
 * What the profile may override.
 *
 * The runtime is the Community composition unless something supplies another,
 * which is how a test drives the plugin without a workspace on disk. The
 * Harness context is not defaulted: reading which workspace and session are
 * open is not a fact this plugin can obtain on its own, and inventing one
 * would be the guess the host exists to avoid.
 */
export type ScrumBundleConfig = ScrumHostConfig

export function apply(ctx: Context, config: ScrumBundleConfig = {}): void {
  applyHost(ctx, { ...config, runtime: config.runtime ?? createCommunityRuntime() })
}
