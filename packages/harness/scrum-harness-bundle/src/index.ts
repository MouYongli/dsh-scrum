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
import { getOrCreateAnonymousUserId } from '@deepseek-ai/dsh-anonymous-user-id'
// Augmentations only: the two services this plugin reads are declared by the
// packages that provide them, and Cordis has no other way to learn their types.
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-client-connection'
import { SCRUM_CHANNEL } from '@dsh-scrum/scrum-api-contract'
import { createCommunityRuntime } from '@dsh-scrum/edition-community'
import {
  apply as applyHost,
  createChannelHandler,
  createHostApi,
  fingerprintInstanceId,
  scopedHarness,
  type HarnessDirectory,
  type ScrumHostConfig,
  type ScrumRuntime,
} from '@dsh-scrum/scrum-harness-host'

export { name } from '@dsh-scrum/scrum-harness-host'

/**
 * What the plugin waits for.
 *
 * The workspace registry answers the ids the browser sends, and the connection
 * carries the channel it sends them on. Neither is optional: without them the
 * host would load and answer every call with "no workspace", which reads as a
 * user who has selected nothing rather than as a plugin that is not wired.
 */
export const inject = ['workspaceRegistry', 'connection']

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
  const runtime = config.runtime ?? createCommunityRuntime()
  applyHost(ctx, { ...config, runtime })
  serveChannel(ctx, runtime)
}

/**
 * The Harness, as the host's lookups.
 *
 * A session's workspace is read from the registry's own accounting rather than
 * from the session header: the registry filters that account by canonical cwd
 * already, so asking it is asking the same question the sidebar's grouping
 * answers, and one place decides.
 *
 * The instance id is hashed on the way in. The Harness identifies its
 * installation with the id it also reports telemetry under, and this one is
 * written into every workspace binding under `.scrum/`, which is committed to
 * the user's repository as often as not.
 */
function harnessDirectory(ctx: Context): HarnessDirectory {
  return {
    instanceId: fingerprintInstanceId(getOrCreateAnonymousUserId()),
    workspace: (id) => {
      // The ids arrive as plain strings off the wire and are branded on the
      // Harness side. Resolving them is the check — an id that is not one
      // simply finds nothing.
      const workspace = ctx.workspaceRegistry.get(id as never)
      return Promise.resolve(
        workspace === undefined
          ? null
          : { id: workspace.id, path: workspace.path, name: workspace.title },
      )
    },
    session: (id) => {
      const owner = ctx.workspaceRegistry
        .list()
        .find((workspace) => workspace.sessionIds.includes(id as never))
      return Promise.resolve({ id, workspaceId: owner?.id ?? null })
    },
  }
}

/**
 * Serves the workbench channel.
 *
 * `loopback` rather than a trusted-host authority: Community is a local
 * edition, its data is the user's own working directory, and the shell does
 * not support serving the browser half beyond loopback until there is an
 * authentication layer to serve it behind.
 */
function serveChannel(ctx: Context, runtime: ScrumRuntime): void {
  const directory = harnessDirectory(ctx)
  const handle = createChannelHandler((scope) =>
    createHostApi(scopedHarness(directory, scope), runtime),
  )
  // An effect rather than a bare call: the registration belongs to this
  // fiber, so unloading the plugin takes the channel with it instead of
  // leaving an endpoint that answers into a disposed context.
  ctx.effect(() =>
    ctx.connection.rpc.handle(
      SCRUM_CHANNEL,
      async (endpoint: string, payload: unknown) => await handle(endpoint, payload),
      { authority: 'loopback' },
    ),
  )
}
