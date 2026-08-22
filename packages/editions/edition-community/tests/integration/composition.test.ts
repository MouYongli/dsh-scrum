import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  COMMUNITY_CAPABILITIES,
  communityCapabilities,
  createCommunityRuntime,
} from '@dsh-scrum/edition-community'
import { workspaceLayout } from '@dsh-scrum/adapter-storage-workspace-files'
import {
  ACTIVITY_SOURCE,
  createProject,
  createWorkItem,
  getProject,
  listWorkItems,
} from '@dsh-scrum/scrum-application'
import type { ActorContext } from '@dsh-scrum/scrum-application'
import { CAPABILITY, WORK_ITEM_TYPE, toProjectKey } from '@dsh-scrum/scrum-domain'
import type { HarnessWorkspace } from '@dsh-scrum/scrum-harness-host'

// The composition is exercised through the use cases, because that is the only
// thing that ever runs against it. A test that called the ports directly would
// verify the wiring and not the thing the wiring is for.

let root: string
let workspace: HarnessWorkspace

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-scrum-community-'))
  workspace = { id: 'ws_1', path: root, name: 'shop-service' }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function actorFor(runtime = createCommunityRuntime()): Promise<ActorContext> {
  return {
    identityId: await runtime.identity(workspace),
    source: ACTIVITY_SOURCE.ui,
    sessionId: null,
  }
}

describe('what a Community installation is licensed to do', () => {
  it('grants the core and a basic audit, and nothing a single user has no use for', () => {
    expect([...COMMUNITY_CAPABILITIES]).toEqual([CAPABILITY.core, CAPABILITY.auditBasic])
    expect(communityCapabilities.has(CAPABILITY.core)).toBe(true)
    expect(communityCapabilities.has(CAPABILITY.collaboration)).toBe(false)
    expect(communityCapabilities.has(CAPABILITY.rbac)).toBe(false)
    expect(communityCapabilities.has(CAPABILITY.sso)).toBe(false)
  })
})

describe('the identity nobody signs in as', () => {
  it('is minted for an empty workspace and read back from the project afterwards', async () => {
    const runtime = createCommunityRuntime()
    const first = await runtime.identity(workspace)

    await createProject(await runtime.forWorkspace(workspace), {
      actor: { identityId: first, source: ACTIVITY_SOURCE.ui, sessionId: null },
      command: {
        tenantId: await runtime.tenant(workspace),
        key: toProjectKey('SCR'),
        name: 'shop-service',
      },
    })

    expect(await runtime.identity(workspace)).toBe(first)
    // A fresh composition finds the same person, because the answer is stored
    // in the project rather than remembered in the process.
    expect(await createCommunityRuntime().identity(workspace)).toBe(first)
  })
})

describe('a project created through the composition', () => {
  it('runs the whole use case: permissions, storage and the activity log', async () => {
    const runtime = createCommunityRuntime()
    const deps = await runtime.forWorkspace(workspace)
    const actor = await actorFor(runtime)

    const stored = await createProject(deps, {
      actor,
      command: {
        tenantId: await runtime.tenant(workspace),
        key: toProjectKey('SCR'),
        name: 'shop-service',
      },
    })
    const created = await createWorkItem(deps, {
      actor,
      command: {
        projectId: stored.project.id,
        type: WORK_ITEM_TYPE.story,
        title: '结算对账',
      },
    })

    expect(created.id).toBe('SCR-1')
    expect(
      (await getProject(deps, { actor, command: { projectId: stored.project.id } })).project.name,
    ).toBe('shop-service')
    expect(
      await listWorkItems(deps, { actor, command: { projectId: stored.project.id } }),
    ).toHaveLength(1)
    expect(await readdir(workspaceLayout(root).activities)).not.toEqual([])
  })

  it('writes nothing outside the .scrum directory', async () => {
    const runtime = createCommunityRuntime()
    const deps = await runtime.forWorkspace(workspace)
    const actor = await actorFor(runtime)

    await createProject(deps, {
      actor,
      command: {
        tenantId: await runtime.tenant(workspace),
        key: toProjectKey('SCR'),
        name: 'shop-service',
      },
    })

    expect(await readdir(root)).toEqual(['.scrum'])
  })
})

describe('two workspaces on one installation', () => {
  it('keep separate data, which is what one project per workspace means', async () => {
    const other = await mkdtemp(join(tmpdir(), 'dsh-scrum-community-other-'))
    try {
      const runtime = createCommunityRuntime()
      const here = await runtime.forWorkspace(workspace)
      const there = await runtime.forWorkspace({ id: 'ws_2', path: other, name: 'billing' })

      const first = await createProject(here, {
        actor: await actorFor(runtime),
        command: {
          tenantId: await runtime.tenant(workspace),
          key: toProjectKey('SCR'),
          name: 'shop-service',
        },
      })
      const second = await createProject(there, {
        actor: {
          identityId: await runtime.identity({ id: 'ws_2', path: other, name: 'billing' }),
          source: ACTIVITY_SOURCE.ui,
          sessionId: null,
        },
        command: {
          tenantId: await runtime.tenant({ id: 'ws_2', path: other, name: 'billing' }),
          key: toProjectKey('BIL'),
          name: 'billing',
        },
      })

      expect(first.project.id).not.toBe(second.project.id)
      expect(await here.projects.find(second.project.id)).toBeNull()
    } finally {
      await rm(other, { recursive: true, force: true })
    }
  })
})
