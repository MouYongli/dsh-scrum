import type { IdentityId, ProjectId, ProjectMember } from '@dsh-scrum/scrum-domain'

/**
 * How a use case finds out what an actor may do in a project.
 *
 * Read-only for now: managing members needs the `rbac` capability, which
 * Community does not have, so the write side arrives with the edition that
 * can use it. A single-user edition satisfies this port by synthesising the
 * owner from `project.createdBy` rather than storing a member file.
 *
 * A missing membership and a suspended one both mean no roles, so callers get
 * `null` for the first and let `memberRoles` collapse the second.
 */
export interface MemberRepository {
  find(projectId: ProjectId, identityId: IdentityId): Promise<ProjectMember | null>
}
