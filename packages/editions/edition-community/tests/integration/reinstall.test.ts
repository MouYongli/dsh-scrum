import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCommunityRuntime } from '@dsh-scrum/edition-community'
import { workspaceLayout } from '@dsh-scrum/adapter-storage-workspace-files'
import {
  ACTIVITY_SOURCE,
  createProject,
  createWorkItem,
  getProject,
  listWorkItems,
  type ActorContext,
  type ApplicationDependencies,
} from '@dsh-scrum/scrum-application'
import { WORK_ITEM_TYPE, toProjectKey, type ProjectId } from '@dsh-scrum/scrum-domain'
import type { HarnessWorkspace } from '@dsh-scrum/scrum-harness-host'

// Installing, upgrading, uninstalling and reinstalling the plugin are all the
// same thing as far as the data is concerned: the composition goes away and a
// new one is built over the same directory. Nothing the plugin does at load
// time may touch what is already there, and everything written before must
// still read afterwards.

let root: string
let workspace: HarnessWorkspace

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-scrum-reinstall-'))
  workspace = { id: 'ws_1', path: root, name: 'shop-service' }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function open(): Promise<{ deps: ApplicationDependencies; actor: ActorContext }> {
  const runtime = createCommunityRuntime()
  return {
    deps: await runtime.forWorkspace(workspace),
    actor: {
      identityId: await runtime.identity(workspace),
      source: ACTIVITY_SOURCE.ui,
      sessionId: null,
    },
  }
}

async function seed(): Promise<ProjectId> {
  const { deps, actor } = await open()
  const stored = await createProject(deps, {
    actor,
    command: {
      tenantId: await createCommunityRuntime().tenant(workspace),
      key: toProjectKey('SCR'),
      name: 'shop-service',
    },
  })
  await createWorkItem(deps, {
    actor,
    command: { projectId: stored.project.id, type: WORK_ITEM_TYPE.story, title: '结算对账' },
  })
  return stored.project.id
}

describe('a plugin that goes away and comes back', () => {
  it('finds the same project, the same work and the same person', async () => {
    const projectId = await seed()
    const before = await readdir(workspaceLayout(root).scrum)

    // A reinstall is a fresh composition over the same directory.
    const { deps, actor } = await open()

    expect((await getProject(deps, { actor, command: { projectId } })).project.name).toBe(
      'shop-service',
    )
    expect(await listWorkItems(deps, { actor, command: { projectId } })).toHaveLength(1)
    expect(await readdir(workspaceLayout(root).scrum)).toEqual(before)
  })

  it('keeps the identity, so the owner is still the owner after a reinstall', async () => {
    await seed()
    const first = await createCommunityRuntime().identity(workspace)
    const second = await createCommunityRuntime().identity(workspace)

    expect(second).toBe(first)
  })

  it('keeps the tenant, so the project is not silently moved into another', async () => {
    const projectId = await seed()
    const { deps, actor } = await open()

    expect((await getProject(deps, { actor, command: { projectId } })).project.tenantId).toBe(
      await createCommunityRuntime().tenant(workspace),
    )
  })

  it('writes nothing at all when a composition is built and never used', async () => {
    await seed()
    const before = await readdir(workspaceLayout(root).scrum)

    createCommunityRuntime()
    await createCommunityRuntime().forWorkspace(workspace)

    expect(await readdir(workspaceLayout(root).scrum)).toEqual(before)
  })

  it('leaves an untouched workspace untouched, which is what uninstalling looks like', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'dsh-scrum-untouched-'))
    try {
      await createCommunityRuntime().forWorkspace({ id: 'ws_2', path: empty, name: 'empty' })

      expect(await readdir(empty)).toEqual([])
    } finally {
      await rm(empty, { recursive: true, force: true })
    }
  })
})
