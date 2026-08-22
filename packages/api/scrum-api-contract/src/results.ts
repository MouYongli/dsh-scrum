import type {
  Edition,
  Permission,
  ProjectRole,
  Revision,
  Sprint,
  WorkItem,
} from '@dsh-scrum/scrum-domain'
import { z } from 'zod'

/**
 * What a call answers with, on the wire.
 *
 * Declared here rather than reused from either side, because neither side's
 * type is safe to send. The host's `EntryState` carries the workspace's
 * absolute path and the binding's path fingerprint, and `.scrum/` is committed
 * to the user's repository as often as not — a payload that carried the path
 * would publish the directory layout of every machine the project is opened
 * on. The interface's own views are the other end of the same problem: they
 * are what one client chose to render, and a second client answering the same
 * contract would have to adopt them or diverge.
 *
 * Work items and sprints are the exception and travel as the domain declares
 * them. They are the entities themselves, carry nothing about where they are
 * stored, and a second declaration of a work item would be a copy that drifts
 * from the one the store writes and the agent reads.
 *
 * @module
 */

/** A workspace as the caller may see it: what to show, never where it is. */
export interface WorkspacePayload {
  readonly id: string
  readonly name: string
}

export interface ProjectPayload {
  readonly id: string
  readonly revision: Revision
  readonly key: string
  readonly name: string
  readonly description: string
}

export interface RuntimeContextPayload {
  readonly edition: Edition
  readonly serviceName: string
  readonly tenantName: string
}

/**
 * What the plugin found when it opened.
 *
 * Five states, each carrying exactly what that state has. `stale` drops the
 * binding the host holds: that a binding no longer resolves is the whole
 * answer, and the identifier it pointed at is of no use to a screen that can
 * only offer to detach it.
 */
type EntryWithoutRuntime =
  | { readonly state: 'no-workspace' }
  | { readonly state: 'unbound'; readonly workspace: WorkspacePayload }
  | { readonly state: 'stale'; readonly workspace: WorkspacePayload }
  | {
      readonly state: 'bound' | 'archived'
      readonly workspace: WorkspacePayload
      readonly project: ProjectPayload
      /** The workspace is not where it was when it was attached. */
      readonly moved: boolean
    }

export type EntryPayload = EntryWithoutRuntime & {
  readonly runtimeContext?: RuntimeContextPayload
}

/**
 * What the host answered about the current user in the bound project.
 *
 * Permissions are resolved from the current principal, capabilities, project
 * policy and project state. A conversation may be recorded as provenance but
 * never narrows this result.
 */
export interface AuthorizationPayload {
  readonly permissions: readonly Permission[]
  readonly projectArchived: boolean
  readonly membership: {
    readonly mode: 'personal' | 'managed'
    readonly roles: readonly ProjectRole[]
  }
}

/**
 * The result schema for one payload type.
 *
 * Structural rather than field-by-field, deliberately. The envelope around it
 * is still parsed — a response from a version this build does not speak is
 * refused as such — but the payload is not re-derived: the host is this
 * plugin's own code answering over a loopback channel, so a malformed payload
 * is a bug in a package that shipped together with this one, not input from
 * somebody else. The parsing effort belongs on the inbound side, where the
 * browser is the untrusted end.
 */
export function payloadSchema<Payload>(): z.ZodType<Payload> {
  return z.custom<Payload>(() => true)
}

export const entryPayloadSchema = payloadSchema<EntryPayload>()
export const projectPayloadSchema = payloadSchema<ProjectPayload>()
export const authorizationPayloadSchema = payloadSchema<AuthorizationPayload>()
export const workItemPayloadSchema = payloadSchema<WorkItem>()
export const workItemsPayloadSchema = payloadSchema<readonly WorkItem[]>()
export const sprintPayloadSchema = payloadSchema<Sprint>()
export const sprintsPayloadSchema = payloadSchema<readonly Sprint[]>()
