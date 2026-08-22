import { readdir } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  workspaceLayout,
  type WorkspaceRepositories,
} from '@dsh-scrum/adapter-storage-workspace-files'
import { toIdempotencyKey, toWorkspaceRef } from '@dsh-scrum/scrum-application'
import { ERROR_CODE } from '@dsh-scrum/scrum-domain'
import {
  OWNER,
  T1,
  codeOf,
  initialisedWorkspace,
  openWorkspace,
  project,
  removeWorkspace,
} from '../support/workspace.js'

let root: string
let repositories: WorkspaceRepositories

beforeEach(async () => {
  ;({ root, repositories } = await initialisedWorkspace('local-state'))
})

afterEach(async () => {
  await removeWorkspace(root)
})

describe('the workspace binding', () => {
  const workspace = toWorkspaceRef('dsh_local_1', 'ws_1')

  async function bind(): Promise<void> {
    await repositories.bindings.save({
      workspace,
      projectId: project.id,
      linkedBy: OWNER,
      linkedAt: T1,
      pathFingerprint: 'sha256:abc',
    })
  }

  it('is absent until something records one', async () => {
    expect(await repositories.bindings.find(workspace)).toBeNull()
  })

  it('remembers where the workspace was, which nothing else on disk can say', async () => {
    await bind()

    expect((await repositories.bindings.find(workspace))?.pathFingerprint).toBe('sha256:abc')
  })

  it('answers for the installation and workspace that recorded it, and no other', async () => {
    await bind()

    expect(await repositories.bindings.find(toWorkspaceRef('dsh_local_2', 'ws_1'))).toBeNull()
    expect(await repositories.bindings.find(toWorkspaceRef('dsh_local_1', 'ws_2'))).toBeNull()
  })

  it('never spells the installation out in a filename, because .scrum is committed', async () => {
    await bind()

    expect(await readdir(workspaceLayout(root).bindings)).not.toContain('dsh_local_1.json')
  })

  it('detaches without touching the project', async () => {
    await bind()

    await repositories.bindings.remove(workspace)

    expect(await repositories.bindings.find(workspace)).toBeNull()
    expect(await repositories.projects.find(project.id)).not.toBeNull()
  })

  it('detaches an installation that never attached, rather than failing', async () => {
    await expect(repositories.bindings.remove(workspace)).resolves.toBeUndefined()
  })
})

describe('idempotency records', () => {
  const key = toIdempotencyKey('create-shop-service')
  const record = {
    key,
    action: 'project.create',
    actorId: OWNER,
    at: T1,
    reference: project.id,
  }

  it('is absent until an operation records one', async () => {
    expect(await repositories.idempotency.find(key)).toBeNull()
  })

  it('survives a restart, which is when a retry actually arrives', async () => {
    await repositories.idempotency.save(record)

    expect((await openWorkspace(root).idempotency.find(key))?.reference).toBe(project.id)
  })

  it('refuses a key that is already recorded, so two callers cannot both proceed', async () => {
    await repositories.idempotency.save(record)

    expect(await codeOf(async () => await repositories.idempotency.save(record))).toBe(
      ERROR_CODE.conflict,
    )
  })
})
