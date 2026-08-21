import { ValidationError } from './errors.js'
import { newProjectId, type IdGenerator, type IdentityId, type ProjectId } from './ids.js'
import type { ProjectKey, TenantId } from './ids.js'
import { createEntityMetadata, touchEntityMetadata, type EntityMetadata } from './metadata.js'
import { requireOptionalText, requireText } from './text.js'
import type { Timestamp } from './time.js'

const MAX_NAME_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 2000

/**
 * Persisted lifecycle of a project. An archived project stays readable so that
 * history, exports and reports keep working; it simply stops accepting writes.
 */
export const PROJECT_STATUS = {
  active: 'active',
  archived: 'archived',
} as const

export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS]

const STATUSES: readonly string[] = Object.values(PROJECT_STATUS)

export function toProjectStatus(value: string): ProjectStatus {
  if (!STATUSES.includes(value)) {
    throw new ValidationError('ProjectStatus must be active or archived', { value })
  }
  return value as ProjectStatus
}

/**
 * A Scrum project. The identifier is stable and never derived from the name,
 * so renaming a project cannot orphan the work items that reference it. The
 * key is fixed at creation for the same reason: it is embedded in every work
 * item identifier.
 */
export interface Project extends EntityMetadata {
  readonly id: ProjectId
  readonly tenantId: TenantId
  readonly key: ProjectKey
  readonly name: string
  readonly description: string
  readonly status: ProjectStatus
  readonly createdBy: IdentityId
}

export interface CreateProjectInput {
  readonly ids: IdGenerator
  readonly tenantId: TenantId
  readonly key: ProjectKey
  readonly name: string
  readonly description?: string | undefined
  readonly createdBy: IdentityId
  readonly now: Timestamp
}

export function createProject(input: CreateProjectInput): Project {
  return {
    ...createEntityMetadata(input.now),
    id: newProjectId(input.ids),
    tenantId: input.tenantId,
    key: input.key,
    name: requireText(input.name, 'Project name', MAX_NAME_LENGTH),
    description: requireOptionalText(
      input.description ?? '',
      'Project description',
      MAX_DESCRIPTION_LENGTH,
    ),
    status: PROJECT_STATUS.active,
    createdBy: input.createdBy,
  }
}

export interface ProjectDetailChanges {
  readonly name?: string | undefined
  readonly description?: string | undefined
}

export function updateProjectDetails(
  project: Project,
  changes: ProjectDetailChanges,
  now: Timestamp,
): Project {
  assertProjectWritable(project)
  return {
    ...project,
    ...touchEntityMetadata(project, now),
    name:
      changes.name === undefined
        ? project.name
        : requireText(changes.name, 'Project name', MAX_NAME_LENGTH),
    description:
      changes.description === undefined
        ? project.description
        : requireOptionalText(changes.description, 'Project description', MAX_DESCRIPTION_LENGTH),
  }
}

/**
 * Archiving is refused rather than treated as idempotent. A silent no-op reads
 * as success to the caller while the revision it will send next is already
 * stale, and a double-clicked button would burn a revision for no change.
 *
 * `ValidationError` rather than `ConflictError`: nothing here is out of date,
 * the transition itself is illegal. `ConflictError` stays reserved for a write
 * whose `expectedRevision` no longer matches.
 */
export function archiveProject(project: Project, now: Timestamp): Project {
  if (project.status === PROJECT_STATUS.archived) {
    throw new ValidationError('project is already archived', {
      projectId: project.id,
      status: project.status,
    })
  }
  return { ...project, ...touchEntityMetadata(project, now), status: PROJECT_STATUS.archived }
}

/**
 * The one mutation that must not call `assertProjectWritable`: an archived
 * project is exactly the state restoring operates on, so guarding it would
 * make the transition unreachable.
 */
export function restoreProject(project: Project, now: Timestamp): Project {
  if (project.status === PROJECT_STATUS.active) {
    throw new ValidationError('project is already active', {
      projectId: project.id,
      status: project.status,
    })
  }
  return { ...project, ...touchEntityMetadata(project, now), status: PROJECT_STATUS.active }
}

export function isProjectWritable(project: Project): boolean {
  return project.status === PROJECT_STATUS.active
}

/**
 * Guard every project-scoped write goes through. Work items, sprints and the
 * project configuration all call it once their aggregates exist, so "archived
 * means read-only" is enforced in one place rather than remembered per caller.
 */
export function assertProjectWritable(project: Project): void {
  if (!isProjectWritable(project)) {
    throw new ValidationError('project is archived and does not accept writes', {
      projectId: project.id,
      status: project.status,
    })
  }
}
