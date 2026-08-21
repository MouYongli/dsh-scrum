import type { Brand } from './brand.js'
import { ValidationError } from './errors.js'
import { requirePositiveInteger } from './integers.js'

/** Owner of all data and permissions. Community uses an implicit personal tenant. */
export type TenantId = Brand<string, 'TenantId'>
/** Stable project identifier. Never reused, and never derived from a name. */
export type ProjectId = Brand<string, 'ProjectId'>
/** Actor identity: a local user in Community, a directory account elsewhere. */
export type IdentityId = Brand<string, 'IdentityId'>
/** Membership of one identity in one project. Carries the roles. */
export type MemberId = Brand<string, 'MemberId'>
/** Short uppercase project key such as `SCR`, used as the work item prefix. */
export type ProjectKey = Brand<string, 'ProjectKey'>
/** Human-readable work item key such as `SCR-12`. */
export type WorkItemId = Brand<string, 'WorkItemId'>
/** Sprint identifier such as `sprint-12`. */
export type SprintId = Brand<string, 'SprintId'>

export const ID_PREFIX = {
  tenant: 'tnt',
  project: 'prj',
  identity: 'idt',
  member: 'mbr',
} as const

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX]

// Crockford base32 without I, L, O and U, as produced by ULID. A ULID sorts
// lexicographically by creation time, which keeps directory listings and
// exports stable without a separate sort key. The first character tops out at
// `7`: it carries the high bits of the 48-bit timestamp, so `8`-`Z` can only
// come from something that is not a ULID.
const ULID_BODY = '[0-7][0-9A-HJKMNP-TV-Z]{25}'
// One spelling for the key rule, so `PROJECT_KEY` and the prefix inside
// `WORK_ITEM_ID` cannot drift apart.
const PROJECT_KEY_BODY = '[A-Z][A-Z0-9]{1,9}'
const PROJECT_KEY = new RegExp(`^${PROJECT_KEY_BODY}$`)
const WORK_ITEM_ID = new RegExp(`^(${PROJECT_KEY_BODY})-([1-9][0-9]*)$`)
const SPRINT_ID = /^sprint-([1-9][0-9]*)$/

function prefixedIdPattern(prefix: IdPrefix): RegExp {
  return new RegExp(`^${prefix}_${ULID_BODY}$`)
}

const PREFIXED_ID: Record<IdPrefix, RegExp> = {
  [ID_PREFIX.tenant]: prefixedIdPattern(ID_PREFIX.tenant),
  [ID_PREFIX.project]: prefixedIdPattern(ID_PREFIX.project),
  [ID_PREFIX.identity]: prefixedIdPattern(ID_PREFIX.identity),
  [ID_PREFIX.member]: prefixedIdPattern(ID_PREFIX.member),
}

function parsePrefixedId(prefix: IdPrefix, value: string, kind: string): string {
  if (!PREFIXED_ID[prefix].test(value)) {
    throw new ValidationError(`${kind} must look like ${prefix}_<ulid>`, { value })
  }
  return value
}

export function toTenantId(value: string): TenantId {
  return parsePrefixedId(ID_PREFIX.tenant, value, 'TenantId') as TenantId
}

export function toProjectId(value: string): ProjectId {
  return parsePrefixedId(ID_PREFIX.project, value, 'ProjectId') as ProjectId
}

export function toIdentityId(value: string): IdentityId {
  return parsePrefixedId(ID_PREFIX.identity, value, 'IdentityId') as IdentityId
}

export function toMemberId(value: string): MemberId {
  return parsePrefixedId(ID_PREFIX.member, value, 'MemberId') as MemberId
}

export function toProjectKey(value: string): ProjectKey {
  if (!PROJECT_KEY.test(value)) {
    throw new ValidationError(
      'ProjectKey must be an uppercase letter followed by 1 to 9 uppercase letters or digits',
      { value },
    )
  }
  return value as ProjectKey
}

export function toWorkItemId(value: string): WorkItemId {
  if (!WORK_ITEM_ID.test(value)) {
    throw new ValidationError('WorkItemId must look like SCR-12', { value })
  }
  return value as WorkItemId
}

export function toSprintId(value: string): SprintId {
  if (!SPRINT_ID.test(value)) {
    throw new ValidationError('SprintId must look like sprint-12', { value })
  }
  return value as SprintId
}

/** Project key a work item belongs to, read back from its identifier. */
export function projectKeyOf(workItemId: WorkItemId): ProjectKey {
  const match = WORK_ITEM_ID.exec(workItemId)
  if (match?.[1] === undefined) {
    throw new ValidationError('WorkItemId must look like SCR-12', { value: workItemId })
  }
  return match[1] as ProjectKey
}

function requireSequence(sequence: number, kind: string): number {
  return requirePositiveInteger(sequence, `${kind} sequence`)
}

/** Builds `SCR-12` from its project key and per-project sequence number. */
export function formatWorkItemId(projectKey: ProjectKey, sequence: number): WorkItemId {
  return `${projectKey}-${requireSequence(sequence, 'WorkItemId')}` as WorkItemId
}

/** Builds `sprint-12` from its per-project sequence number. */
export function formatSprintId(sequence: number): SprintId {
  return `sprint-${requireSequence(sequence, 'SprintId')}` as SprintId
}

/**
 * Port for identifier generation. The domain never reaches for a random source
 * itself, so tests and migrations can supply a deterministic generator.
 */
export interface IdGenerator {
  /** A 26 character Crockford base32 ULID body, without a prefix. */
  nextUlid(): string
}

function newPrefixedId(ids: IdGenerator, prefix: IdPrefix, kind: string): string {
  return parsePrefixedId(prefix, `${prefix}_${ids.nextUlid()}`, kind)
}

export function newTenantId(ids: IdGenerator): TenantId {
  return newPrefixedId(ids, ID_PREFIX.tenant, 'TenantId') as TenantId
}

export function newProjectId(ids: IdGenerator): ProjectId {
  return newPrefixedId(ids, ID_PREFIX.project, 'ProjectId') as ProjectId
}

export function newIdentityId(ids: IdGenerator): IdentityId {
  return newPrefixedId(ids, ID_PREFIX.identity, 'IdentityId') as IdentityId
}

export function newMemberId(ids: IdGenerator): MemberId {
  return newPrefixedId(ids, ID_PREFIX.member, 'MemberId') as MemberId
}
