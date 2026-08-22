import { readdir } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  workspaceLayout,
  type WorkspaceRepositories,
} from '@dsh-scrum/adapter-storage-workspace-files'
import { PROJECT_ROLES, toProjectId } from '@dsh-scrum/scrum-domain'
import {
  OTHER_ULID,
  OWNER,
  STRANGER,
  initialisedWorkspace,
  openWorkspace,
  project,
  removeWorkspace,
  temporaryWorkspace,
} from '../support/workspace.js'

let root: string
let repositories: WorkspaceRepositories

beforeEach(async () => {
  ;({ root, repositories } = await initialisedWorkspace('project-repository'))
})

afterEach(async () => {
  await removeWorkspace(root)
})

describe('the project repository', () => {
  it('answers only for the project this workspace holds', async () => {
    expect((await repositories.projects.find(project.id))?.project.name).toBe('shop-service')
    expect(await repositories.projects.find(toProjectId(`prj_${OTHER_ULID}`))).toBeNull()
  })

  it('reports an empty workspace as no project rather than as a broken one', async () => {
    const empty = await temporaryWorkspace('empty')
    try {
      expect(await openWorkspace(empty).projects.find(project.id)).toBeNull()
    } finally {
      await removeWorkspace(empty)
    }
  })

  it('reads the configuration back beside the project, never one without the other', async () => {
    const stored = await repositories.projects.find(project.id)

    expect(stored?.config.projectId).toBe(project.id)
  })
})

describe('the synthesised owner', () => {
  it('writes no member file, because the project already says who created it', async () => {
    expect(await readdir(workspaceLayout(root).scrum)).not.toContain('members')
  })

  it('holds every role, so one user satisfies the whole matrix', async () => {
    const member = await repositories.members.find(project.id, OWNER)

    expect(member?.roles).toEqual(PROJECT_ROLES)
    expect(member?.status).toBe('active')
  })

  it('is the same record on every read, not a new one each time', async () => {
    const first = await repositories.members.find(project.id, OWNER)
    const second = await repositories.members.find(project.id, OWNER)

    expect(first?.id).toBe(second?.id)
  })

  it('is nobody else, which is what keeps the permission check meaningful', async () => {
    expect(await repositories.members.find(project.id, STRANGER)).toBeNull()
  })

  it('is nobody at all in a project this workspace does not hold', async () => {
    expect(await repositories.members.find(toProjectId(`prj_${OTHER_ULID}`), OWNER)).toBeNull()
  })
})
