import { createHash } from 'node:crypto'
import { ValidationError } from '@dsh-scrum/scrum-domain'
import type { ScrumScope } from '@dsh-scrum/scrum-api-contract'
import type { HarnessContext, HarnessSession, HarnessWorkspace } from './workspace.js'

/**
 * What the plugin can look up in the Harness it runs inside.
 *
 * A port rather than the Harness services themselves, so this package keeps
 * its one dependency on the host process — the manifest it reads at load —
 * and the composition that knows it is running inside a real Harness supplies
 * the rest. It also lets every entry state be driven in a test without an
 * install to point at.
 *
 * Both lookups answer `null` for an identifier nobody has heard of rather than
 * throwing. A caller naming a workspace that does not exist is the ordinary
 * case of a stale browser tab, not an error worth a stack trace.
 */
export interface HarnessDirectory {
  /** Identifies this Harness installation; part of every cross-instance reference. */
  readonly instanceId: string
  workspace(id: string): Promise<HarnessWorkspace | null>
  session(id: string): Promise<HarnessSession | null>
}

/**
 * The Harness context for one call, from the scope its caller sent.
 *
 * The host serves every session at once and holds no selection of its own:
 * which workspace is open is a fact about the window in front of the user, and
 * the browser is the only half that knows it. So the caller names both, and
 * this resolves them against the registry rather than believing them — an id
 * that resolves to nothing yields `null`, which is the same answer as having
 * chosen nothing, and is the state the workbench already knows how to draw.
 *
 * The values are read once per call and held, so two reads inside one request
 * cannot disagree because the user clicked something in between.
 */
export function scopedHarness(directory: HarnessDirectory, scope: ScrumScope): HarnessContext {
  let workspace: Promise<HarnessWorkspace | null> | undefined
  let session: Promise<HarnessSession | null> | undefined
  return {
    instanceId: directory.instanceId,
    currentWorkspace: () => {
      workspace ??= scope.workspaceId === null ? nothing() : directory.workspace(scope.workspaceId)
      return workspace
    },
    currentSession: () => {
      session ??= scope.sessionId === null ? nothing() : directory.session(scope.sessionId)
      return session
    },
  }
}

function nothing<Value>(): Promise<Value | null> {
  return Promise.resolve(null)
}

/**
 * The instance id, reduced to something safe to store.
 *
 * The Harness identifies its installation with an id that also identifies it
 * to telemetry, and this one ends up inside every workspace binding — in
 * `.scrum/`, which is committed to the user's repository as often as not.
 * Publishing it would hand a public repository the identity behind that
 * install's usage reports. A digest answers the only question asked of it,
 * which is whether this is the same installation as last time.
 */
export function fingerprintInstanceId(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') {
    throw new ValidationError('a Harness instance id must not be empty', {})
  }
  return `sha256:${createHash('sha256').update(trimmed).digest('hex')}`
}
