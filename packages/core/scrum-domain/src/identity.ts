import { ValidationError } from './errors.js'
import { newIdentityId, type IdGenerator, type IdentityId } from './ids.js'
import { requireText } from './text.js'

const MAX_DISPLAY_NAME_LENGTH = 120

/**
 * Where an actor came from. Community mints a local identity with no login;
 * a remote service supplies a directory account. The distinction matters
 * because a local identity is only meaningful inside one installation and must
 * not be treated as portable when data moves to a shared service.
 */
export const IDENTITY_KIND = {
  local: 'local',
  directory: 'directory',
} as const

export type IdentityKind = (typeof IDENTITY_KIND)[keyof typeof IDENTITY_KIND]

const IDENTITY_KINDS: readonly string[] = Object.values(IDENTITY_KIND)

export function toIdentityKind(value: string): IdentityKind {
  if (!IDENTITY_KINDS.includes(value)) {
    throw new ValidationError('IdentityKind must be local or directory', { value })
  }
  return value as IdentityKind
}

/**
 * The actor behind a change. Deliberately not an entity with metadata: there
 * is no identity file in the storage layout, because who the local user is
 * is a host level bootstrap fact rather than project data. Where a stable
 * identifier is persisted across restarts is decided by the storage adapter.
 */
export interface Identity {
  readonly id: IdentityId
  readonly kind: IdentityKind
  readonly displayName: string
}

export interface CreateLocalIdentityInput {
  readonly ids: IdGenerator
  readonly displayName: string
}

export function createLocalIdentity(input: CreateLocalIdentityInput): Identity {
  return {
    id: newIdentityId(input.ids),
    kind: IDENTITY_KIND.local,
    displayName: requireText(input.displayName, 'Identity display name', MAX_DISPLAY_NAME_LENGTH),
  }
}
