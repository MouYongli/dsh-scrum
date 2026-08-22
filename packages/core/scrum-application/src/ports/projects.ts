import type {
  Project,
  ProjectConfig,
  ProjectId,
  ProjectMember,
  Revision,
} from '@dsh-scrum/scrum-domain'

/**
 * A project and the configuration that governs it, read together.
 *
 * They are two files and two revisions, but no permission decision can be made
 * without both, so a repository that returned them separately would guarantee
 * every caller reads twice and some caller eventually forgets.
 */
export interface StoredProject {
  readonly project: Project
  readonly config: ProjectConfig
}

/**
 * Everything that comes into existence when a project is created.
 *
 * The owner membership travels with it rather than being written separately:
 * a project whose creator is not yet a member is a project nobody can open,
 * and the two writes must not be able to land apart. An edition that derives
 * the owner from `project.createdBy` instead of storing it may ignore this
 * field — Community does — but it is the application that decides the creator
 * holds every role, not the store.
 */
export interface NewProject extends StoredProject {
  readonly owner: ProjectMember
}

export interface ProjectRepository {
  find(id: ProjectId): Promise<StoredProject | null>
  create(project: NewProject): Promise<void>
  /**
   * Replaces the project file, refusing unless the stored revision is still
   * `expected`. There is no unconditional save: a write with no expectation is
   * a write that can silently discard someone else's change.
   */
  save(project: Project, expected: Revision): Promise<void>
  /**
   * Replaces the configuration file. Separate from `save` because the project
   * and its configuration are two files under two revisions, and one call that
   * wrote both would have to invent a rule for what happens when one of the
   * two expectations is stale.
   */
  saveConfig(config: ProjectConfig, expected: Revision): Promise<void>
}
