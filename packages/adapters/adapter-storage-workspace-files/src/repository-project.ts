import {
  MEMBER_STATUS,
  NotFoundError,
  PROJECT_ROLES,
  toMemberId,
  type IdentityId,
  type Project,
  type ProjectConfig,
  type ProjectId,
  type ProjectMember,
  type Revision,
} from '@dsh-scrum/scrum-domain'
import type {
  MemberRepository,
  NewProject,
  ProjectRepository,
  StoredProject,
} from '@dsh-scrum/scrum-application'
import type { Run } from './records.js'
import { initialiseProject, readProjectConfig, readProjectFile } from './store.js'
import { saveProject, saveProjectConfig } from './writes.js'

/** Which product produced the data in this workspace, written into `project.json`. */
export type StoredEdition = Parameters<typeof initialiseProject>[0]['edition']

/**
 * One workspace holds one project, so a lookup by identifier answers only for
 * the project that is there. Returning the stored project for any identifier
 * would let a caller reach a project this workspace was never attached to by
 * passing a different one.
 */
export function projectRepository(
  root: string,
  edition: StoredEdition,
  run: Run,
): ProjectRepository {
  async function stored(): Promise<StoredProject | null> {
    try {
      const file = await readProjectFile(root)
      return { project: file.project, config: await readProjectConfig(root) }
    } catch (error: unknown) {
      if (error instanceof NotFoundError) {
        return null
      }
      throw error
    }
  }

  return {
    find: async (id: ProjectId) => {
      const found = await stored()
      return found === null || found.project.id !== id ? null : found
    },
    /**
     * The owner membership is not written. Community synthesises the single
     * member from `project.createdBy`, so a stored member file would be a
     * second copy of something the project already says.
     *
     * Outside the coordinator, because the lock lives inside `.scrum/` and
     * this call is what creates it. Nothing is lost: `initialiseProject`
     * creates `project.json` exclusively, so a second initialiser loses the
     * race on the filesystem rather than on a lock that does not exist yet.
     */
    create: async (project: NewProject) => {
      await initialiseProject({
        workspaceRoot: root,
        project: project.project,
        config: project.config,
        edition,
      })
    },
    save: async (project: Project, expected: Revision) => {
      await run(async () => {
        const file = await readProjectFile(root)
        await saveProject(root, { ...file, project }, expected)
      })
    },
    saveConfig: async (config: ProjectConfig, expected: Revision) => {
      await run(async () => {
        await saveProjectConfig(root, config, expected)
      })
    },
  }
}

/**
 * The single member, synthesised rather than stored.
 *
 * Community is one person holding every role, and the project already records
 * who created it. Writing a member file would be a second answer to the same
 * question, and the two would disagree the first time one of them was repaired
 * by hand. A membership is reported only for that identity: everyone else is
 * not a member, which is what keeps the permission check meaningful rather
 * than a formality.
 */
export function memberRepository(root: string): MemberRepository {
  return {
    find: async (projectId: ProjectId, identityId: IdentityId) => {
      const file = await readProjectFile(root).catch((error: unknown) => {
        if (error instanceof NotFoundError) {
          return null
        }
        throw error
      })
      if (file === null || file.project.id !== projectId || file.project.createdBy !== identityId) {
        return null
      }
      const owner: ProjectMember = {
        schemaVersion: file.project.schemaVersion,
        revision: file.project.revision,
        createdAt: file.project.createdAt,
        updatedAt: file.project.updatedAt,
        // Derived from the identity rather than minted: Community never looks
        // a member up by this id, and a fresh one on every read would make the
        // same membership look like a different record each time it is asked
        // for. The two prefixes share the ULID grammar, so the result is a
        // valid MemberId by construction.
        id: toMemberId(`mbr_${identityId.slice('idt_'.length)}`),
        projectId,
        identityId,
        roles: PROJECT_ROLES,
        status: MEMBER_STATUS.active,
      }
      return owner
    },
  }
}
