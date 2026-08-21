import { ValidationError } from './errors.js'

/**
 * Project roles, spelled exactly as they are persisted in the member record
 * and named by the API contract. They may be added to but never renamed.
 *
 * Its own module rather than part of `permissions.ts`: membership and the
 * permission matrix both need the vocabulary, and putting it in either one
 * would make them import each other.
 */
export const PROJECT_ROLE = {
  productOwner: 'product_owner',
  scrumMaster: 'scrum_master',
  developer: 'developer',
  stakeholder: 'stakeholder',
  administrator: 'administrator',
} as const

export type ProjectRole = (typeof PROJECT_ROLE)[keyof typeof PROJECT_ROLE]

/** Every role, in the order the product design's permission matrix lists them. */
export const PROJECT_ROLES: readonly ProjectRole[] = [
  PROJECT_ROLE.productOwner,
  PROJECT_ROLE.scrumMaster,
  PROJECT_ROLE.developer,
  PROJECT_ROLE.stakeholder,
  PROJECT_ROLE.administrator,
]

const ROLES: readonly string[] = PROJECT_ROLES

export function toProjectRole(value: string): ProjectRole {
  if (!ROLES.includes(value)) {
    throw new ValidationError(`ProjectRole must be one of ${ROLES.join(', ')}`, { value })
  }
  return value as ProjectRole
}

/**
 * One member may hold several roles. Duplicates are collapsed rather than
 * rejected, because a caller merging two sources of roles should not have to
 * deduplicate first; an empty set is refused, because a member with no role is
 * indistinguishable from a member who should not have been added.
 */
export function toProjectRoles(values: readonly string[]): readonly ProjectRole[] {
  const roles = new Set(values.map(toProjectRole))
  if (roles.size === 0) {
    throw new ValidationError('a member must hold at least one role', { values: [...values] })
  }
  return PROJECT_ROLES.filter((role) => roles.has(role))
}
