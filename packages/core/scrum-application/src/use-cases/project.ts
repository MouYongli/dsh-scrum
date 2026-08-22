import {
  CAPABILITY,
  ConflictError,
  PERMISSION,
  archiveProject as archiveProjectEntity,
  createDefaultProjectConfig,
  createOwnerMember,
  createProject as createProjectEntity,
  restoreProject as restoreProjectEntity,
  toProjectId,
  updateProjectDetails as updateProjectDetailsEntity,
  updateProjectConfig,
  type Project,
  type ProjectId,
  type ProjectDetailChanges,
  type ProjectConfigChanges,
  type ProjectKey,
  type Revision,
  type TenantId,
  type Timestamp,
} from '@dsh-scrum/scrum-domain'
import type { ActorContext, UseCaseRequest } from '../actor.js'
import { recordActivity } from '../activity.js'
import {
  assertCapability,
  authorizeProject,
  loadProject,
  type AuthorizedProject,
} from '../authorization.js'
import type { ApplicationDependencies } from '../dependencies.js'
import { runIdempotently, stringReference } from '../idempotency.js'
import type { StoredProject } from '../ports/projects.js'

type Dependencies = Pick<
  ApplicationDependencies,
  'projects' | 'members' | 'capabilities' | 'activity' | 'idempotency' | 'clock' | 'ids'
>

export interface CreateProjectCommand {
  /**
   * The tenant the project belongs to. Supplied here and nowhere else: a
   * tenant is chosen once, and from then on the project is where it is
   * recorded. Community mints a personal tenant per workspace; a remote
   * service supplies the authenticated one.
   */
  readonly tenantId: TenantId
  readonly key: ProjectKey
  readonly name: string
  readonly description?: string | undefined
}

/**
 * Creates a project and makes its creator the owner.
 *
 * There is no permission to check: the matrix decides what a role may do
 * inside a project, and there is no project yet. The capability is the only
 * gate, which is what lets a connected service refuse project creation
 * without having to invent a role for someone who has none.
 *
 * The owner membership is built here rather than in the store. That the
 * creator holds every role is an application rule; whether it is written to a
 * file or derived on read is the store's business.
 */
export async function createProject(
  deps: Dependencies,
  request: UseCaseRequest<CreateProjectCommand>,
): Promise<StoredProject> {
  assertCapability(deps, CAPABILITY.core)
  const { actor, command } = request
  return await runIdempotently(deps, actor, {
    action: 'project.create',
    key: request.idempotencyKey,
    perform: async () => {
      const now = deps.clock.now()
      const project = createProjectEntity({
        ids: deps.ids,
        tenantId: command.tenantId,
        key: command.key,
        name: command.name,
        description: command.description,
        createdBy: actor.identityId,
        now,
      })
      const config = createDefaultProjectConfig(project.id, now)
      const owner = createOwnerMember({
        ids: deps.ids,
        projectId: project.id,
        identityId: actor.identityId,
        now,
      })
      await deps.projects.create({ project, config, owner })
      await report(deps, actor, 'project.create', project)
      return { reference: project.id, result: { project, config } }
    },
    replay: async (reference) => await loadProject(deps, toProjectId(stringReference(reference))),
  })
}

export interface ProjectCommand {
  readonly projectId: ProjectId
}

export interface ConfigureProjectCommand extends ProjectCommand {
  readonly expectedRevision: Revision
  readonly changes: ProjectConfigChanges
}

export interface UpdateProjectDetailsCommand extends ProjectCommand {
  readonly expectedRevision: Revision
  readonly changes: ProjectDetailChanges
}

/** Changes the human-readable project name and description; the key stays immutable. */
export async function updateProjectDetails(
  deps: Dependencies,
  request: UseCaseRequest<UpdateProjectDetailsCommand>,
): Promise<StoredProject> {
  const { actor, command } = request
  const authorized = await authorizeProject(
    deps,
    actor,
    command.projectId,
    PERMISSION.projectConfigure,
  )
  if (authorized.project.revision !== command.expectedRevision) {
    throw new ConflictError(
      'the project changed since it was read',
      command.expectedRevision,
      authorized.project.revision,
      { entityType: 'project', entityId: authorized.project.id },
    )
  }
  const project = updateProjectDetailsEntity(authorized.project, command.changes, deps.clock.now())
  await deps.projects.save(project, authorized.project.revision)
  await recordActivity(deps, actor, {
    action: 'project.update',
    targetType: 'project',
    targetId: project.id,
    revision: project.revision,
  })
  return { project, config: authorized.config }
}

/**
 * Changes the project's settings.
 *
 * The workflow statuses are not among them: a custom workflow changes what
 * every stored status means and needs a migration rather than an edit, which
 * is why the domain leaves them out of the change set entirely.
 */
export async function configureProject(
  deps: Dependencies,
  request: UseCaseRequest<ConfigureProjectCommand>,
): Promise<StoredProject> {
  const { actor, command } = request
  const authorized = await authorizeProject(
    deps,
    actor,
    command.projectId,
    PERMISSION.projectConfigure,
  )
  if (authorized.config.revision !== command.expectedRevision) {
    throw new ConflictError(
      'the project configuration changed since it was read',
      command.expectedRevision,
      authorized.config.revision,
      { entityType: 'projectConfig', entityId: authorized.project.id },
    )
  }
  const config = updateProjectConfig(authorized.config, command.changes, deps.clock.now())
  await deps.projects.saveConfig(config, authorized.config.revision)
  await recordActivity(deps, actor, {
    action: 'project.configure',
    targetType: 'projectConfig',
    targetId: authorized.project.id,
    revision: config.revision,
  })
  return { project: authorized.project, config }
}

/**
 * Reads a project together with what the caller may do to it.
 *
 * The permissions travel with the project because the caller needs them to
 * decide what to offer, and asking separately would let the two answers come
 * from different reads. Nothing is recorded: activity is a record of change,
 * and a log that also held every read would bury the changes in it.
 */
export async function getProject(
  deps: Pick<ApplicationDependencies, 'projects' | 'members' | 'capabilities'>,
  request: UseCaseRequest<ProjectCommand>,
): Promise<AuthorizedProject> {
  return await authorizeProject(
    deps,
    request.actor,
    request.command.projectId,
    PERMISSION.projectView,
  )
}

export async function archiveProject(
  deps: Dependencies,
  request: UseCaseRequest<ProjectCommand>,
): Promise<StoredProject> {
  return await transition(deps, request, 'project.archive', archiveProjectEntity)
}

/**
 * Restoring is the same transition in the other direction and takes the same
 * permission. An edition that could archive but not restore would turn a
 * mistaken click into a one-way door.
 */
export async function restoreProject(
  deps: Dependencies,
  request: UseCaseRequest<ProjectCommand>,
): Promise<StoredProject> {
  return await transition(deps, request, 'project.restore', restoreProjectEntity)
}

async function transition(
  deps: Dependencies,
  request: UseCaseRequest<ProjectCommand>,
  action: string,
  apply: (project: Project, now: Timestamp) => Project,
): Promise<StoredProject> {
  const { actor, command } = request
  const authorized = await authorizeProject(
    deps,
    actor,
    command.projectId,
    PERMISSION.projectArchive,
  )
  return await runIdempotently(deps, actor, {
    action,
    key: request.idempotencyKey,
    perform: async () => {
      const project = apply(authorized.project, deps.clock.now())
      await deps.projects.save(project, authorized.project.revision)
      await report(deps, actor, action, project)
      return { reference: project.id, result: { project, config: authorized.config } }
    },
    replay: async (reference) => await loadProject(deps, toProjectId(stringReference(reference))),
  })
}

async function report(
  deps: Pick<ApplicationDependencies, 'activity' | 'clock'>,
  actor: ActorContext,
  action: string,
  project: Project,
): Promise<void> {
  await recordActivity(deps, actor, {
    action,
    targetType: 'project',
    targetId: project.id,
    revision: project.revision,
  })
}
