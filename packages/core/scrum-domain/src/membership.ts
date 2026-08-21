import { ValidationError } from './errors.js'
import { newMemberId, type IdGenerator, type IdentityId, type MemberId } from './ids.js'
import type { ProjectId, TenantId } from './ids.js'
import { createEntityMetadata, touchEntityMetadata, type EntityMetadata } from './metadata.js'
import { PROJECT_ROLES, toProjectRoles, type ProjectRole } from './roles.js'
import type { Timestamp } from './time.js'

/**
 * Whether the membership currently grants anything. Suspending is kept
 * distinct from removal so that a member's history, assignments and activity
 * records stay resolvable after their access ends.
 */
export const MEMBER_STATUS = {
  active: 'active',
  suspended: 'suspended',
} as const

export type MemberStatus = (typeof MEMBER_STATUS)[keyof typeof MEMBER_STATUS]

const STATUSES: readonly string[] = Object.values(MEMBER_STATUS)

export function toMemberStatus(value: string): MemberStatus {
  if (!STATUSES.includes(value)) {
    throw new ValidationError('MemberStatus must be active or suspended', { value })
  }
  return value as MemberStatus
}

/**
 * One identity's membership of one project, carrying the roles it holds there.
 *
 * The stored `joined_at` of the data model is `createdAt` here rather than a
 * second field: they describe the same instant, and two fields that must agree
 * are two fields that will eventually disagree.
 */
export interface ProjectMember extends EntityMetadata {
  readonly id: MemberId
  readonly tenantId: TenantId
  readonly projectId: ProjectId
  readonly identityId: IdentityId
  readonly roles: readonly ProjectRole[]
  readonly status: MemberStatus
}

export interface CreateProjectMemberInput {
  readonly ids: IdGenerator
  readonly tenantId: TenantId
  readonly projectId: ProjectId
  readonly identityId: IdentityId
  readonly roles: readonly ProjectRole[]
  readonly now: Timestamp
}

export function createProjectMember(input: CreateProjectMemberInput): ProjectMember {
  return {
    ...createEntityMetadata(input.now),
    id: newMemberId(input.ids),
    tenantId: input.tenantId,
    projectId: input.projectId,
    identityId: input.identityId,
    roles: toProjectRoles(input.roles),
    status: MEMBER_STATUS.active,
  }
}

/**
 * The membership a project's creator gets. It holds every role, which is what
 * makes a single-user installation workable without weakening the matrix: the
 * owner is not exempt from permission checks, they simply satisfy all of them
 * that their edition's capabilities allow.
 */
export function createOwnerMember(input: Omit<CreateProjectMemberInput, 'roles'>): ProjectMember {
  return createProjectMember({ ...input, roles: PROJECT_ROLES })
}

export function setMemberRoles(
  member: ProjectMember,
  roles: readonly ProjectRole[],
  now: Timestamp,
): ProjectMember {
  return { ...member, ...touchEntityMetadata(member, now), roles: toProjectRoles(roles) }
}

export function setMemberStatus(
  member: ProjectMember,
  status: MemberStatus,
  now: Timestamp,
): ProjectMember {
  if (member.status === status) {
    throw new ValidationError(`member is already ${status}`, {
      memberId: member.id,
      status: member.status,
    })
  }
  return { ...member, ...touchEntityMetadata(member, now), status }
}

/**
 * The roles a permission check should see. A suspended member reports none,
 * so "suspended means no access" cannot be forgotten at a call site: the
 * stored roles stay intact for when the membership is reinstated.
 */
export function memberRoles(member: ProjectMember): readonly ProjectRole[] {
  return member.status === MEMBER_STATUS.active ? member.roles : []
}
