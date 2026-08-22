import { createHash } from 'node:crypto'
import { ValidationError } from '@dsh-scrum/scrum-domain'
import { toWorkspaceRef, type WorkspaceRef } from '@dsh-scrum/scrum-application'

/**
 * A Harness workspace as this plugin needs it: a stable id, the canonical
 * directory it records, and a display name.
 *
 * The id is the reference. A workspace that is renamed or moved is the same
 * workspace, and using the path as the key is how a binding follows a synced
 * folder onto a machine it was never meant to reach.
 */
export interface HarnessWorkspace {
  readonly id: string
  readonly path: string
  readonly name: string
}

/** A Harness session, and the workspace it belongs to if it belongs to one. */
export interface HarnessSession {
  readonly id: string
  readonly workspaceId: string | null
}

/**
 * Everything the plugin learns from the Harness it is loaded into.
 *
 * A port rather than direct service reads, because the host must never work
 * out which workspace is open by looking at the filesystem: the answer would
 * be a guess that disagrees with the one the user sees in the sidebar. It is
 * also what lets the entry states be tested without a Harness install.
 */
export interface HarnessContext {
  /** Identifies this Harness installation; part of every cross-instance reference. */
  readonly instanceId: string
  currentWorkspace(): Promise<HarnessWorkspace | null>
  currentSession(): Promise<HarnessSession | null>
}

/** The reference a binding is keyed by: the instance and the workspace together. */
export function workspaceRefOf(harness: HarnessContext, workspace: HarnessWorkspace): WorkspaceRef {
  return toWorkspaceRef(harness.instanceId, workspace.id)
}

const FINGERPRINT_ALGORITHM = 'sha256'

/**
 * A stable digest of where a workspace sits.
 *
 * Hashed rather than stored verbatim: the path can name a person, a client or
 * an unreleased product, and `.scrum/` is committed to the user's repository
 * as often as not. A digest still answers the only question asked of it —
 * whether this is the same directory as last time.
 */
export function fingerprintWorkspacePath(path: string): string {
  const normalized = path.trim().replace(/[/\\]+$/, '')
  if (normalized === '') {
    throw new ValidationError('a workspace path must not be empty', { path })
  }
  return `${FINGERPRINT_ALGORITHM}:${createHash(FINGERPRINT_ALGORITHM).update(normalized).digest('hex')}`
}

/**
 * Whether a session belongs to the workspace.
 *
 * A session is a member of at most one workspace, and one from elsewhere must
 * not be recorded as the session behind a change here — an audit trail that
 * names an unrelated conversation is worse than one that names none.
 */
export function sessionBelongsTo(
  session: HarnessSession | null,
  workspace: HarnessWorkspace,
): boolean {
  return session !== null && session.workspaceId === workspace.id
}
