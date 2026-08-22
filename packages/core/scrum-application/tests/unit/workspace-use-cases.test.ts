import { describe, expect, it } from 'vitest'
import { PERMISSION, toProjectKey, toTenantId } from '@dsh-scrum/scrum-domain'
import {
  bindWorkspace,
  createProject,
  resolveWorkspaceBinding,
  toWorkspaceRef,
  unbindWorkspace,
  type StoredProject,
} from '@dsh-scrum/scrum-application'
import { ACTOR_ID, OTHER_ID, actor, dependencies, type TestDependencies } from '../support/fakes.js'

const WORKSPACE = toWorkspaceRef('dsh_local_1', '/home/me/shop-service')
const OTHER_WORKSPACE = toWorkspaceRef('dsh_local_2', '/home/me/shop-service')

async function seed(deps: TestDependencies, owned = true): Promise<StoredProject> {
  const stored = await createProject(deps, {
    actor: actor(),
    command: {
      tenantId: toTenantId('tnt_01K00000000000000000000001'),
      key: toProjectKey('SCR'),
      name: 'shop-service',
    },
  })
  if (owned) {
    deps.members.add(deps.projects.owners.get(stored.project.id)!)
  }
  deps.activity.events.length = 0
  return stored
}

async function caught(run: Promise<unknown>): Promise<{ code?: string }> {
  return (await run.catch((error: unknown) => error)) as { code?: string }
}

describe('toWorkspaceRef', () => {
  it('keeps the instance in the identity, so one path on two machines is two workspaces', () => {
    expect(WORKSPACE).not.toEqual(OTHER_WORKSPACE)
  })

  it('rejects a reference with nothing in it', () => {
    expect(() => toWorkspaceRef('dsh_local_1', '   ')).toThrow(/workspace id/)
  })
})

describe('bindWorkspace', () => {
  it('attaches the workspace and records who did it', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)

    const binding = await bindWorkspace(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE, projectId: project.id },
    })

    expect(binding.projectId).toBe(project.id)
    expect(binding.linkedBy).toBe(ACTOR_ID)
    expect(deps.activity.events).toMatchObject([
      { action: 'workspace.bind', targetType: 'workspace', revision: null },
    ])
  })

  it('answers a repeated bind from what is stored rather than binding again', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)
    const command = { workspace: WORKSPACE, projectId: project.id }

    const first = await bindWorkspace(deps, { actor: actor(), command })
    const second = await bindWorkspace(deps, { actor: actor(), command })

    expect(second).toEqual(first)
    expect(deps.activity.events).toHaveLength(1)
  })

  it('refuses to repoint a workspace that is bound elsewhere', async () => {
    const deps = dependencies()
    const first = await seed(deps)
    const second = await seed(deps)
    await bindWorkspace(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE, projectId: first.project.id },
    })

    const error = await caught(
      bindWorkspace(deps, {
        actor: actor(),
        command: { workspace: WORKSPACE, projectId: second.project.id },
      }),
    )

    expect(error.code).toBe('CONFLICT')
    expect((await deps.bindings.find(WORKSPACE))?.projectId).toBe(first.project.id)
  })

  it('refuses an actor the project would not have shown itself to', async () => {
    const deps = dependencies()
    const { project } = await seed(deps, false)

    const error = await caught(
      bindWorkspace(deps, {
        actor: actor({ identityId: OTHER_ID }),
        command: { workspace: WORKSPACE, projectId: project.id },
      }),
    )

    expect(error.code).toBe('FORBIDDEN')
    expect(deps.bindings.bindings.size).toBe(0)
  })
})

describe('resolveWorkspaceBinding', () => {
  it('reports a workspace nothing has been attached to', async () => {
    const deps = dependencies()

    const resolved = await resolveWorkspaceBinding(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE },
    })

    expect(resolved.state).toBe('unbound')
  })

  it('reports the project and what the caller may do to it', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)
    await bindWorkspace(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE, projectId: project.id },
    })

    const resolved = await resolveWorkspaceBinding(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE },
    })

    expect(resolved.state).toBe('bound')
    if (resolved.state !== 'bound') {
      return
    }
    expect(resolved.project.project.id).toBe(project.id)
    expect(resolved.permissions.has(PERMISSION.projectView)).toBe(true)
  })

  it('still reports the binding to an actor who may not open the project', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)
    await bindWorkspace(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE, projectId: project.id },
    })

    const resolved = await resolveWorkspaceBinding(deps, {
      actor: actor({ identityId: OTHER_ID }),
      command: { workspace: WORKSPACE },
    })

    expect(resolved.state).toBe('bound')
    if (resolved.state !== 'bound') {
      return
    }
    expect([...resolved.permissions]).toEqual([])
  })

  it('reports a binding whose project is gone as stale rather than unbound', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)
    await bindWorkspace(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE, projectId: project.id },
    })
    deps.projects.stored.clear()

    const resolved = await resolveWorkspaceBinding(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE },
    })

    expect(resolved.state).toBe('stale')
  })

  it('writes nothing, so a read-only checkout stays openable', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)
    await bindWorkspace(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE, projectId: project.id },
    })
    const before = { ...deps.bindings.bindings.get('dsh_local_1//home/me/shop-service')! }
    deps.activity.events.length = 0

    await resolveWorkspaceBinding(deps, { actor: actor(), command: { workspace: WORKSPACE } })

    expect(deps.bindings.bindings.get('dsh_local_1//home/me/shop-service')).toEqual(before)
    expect(deps.activity.events).toEqual([])
  })
})

describe('unbindWorkspace', () => {
  it('detaches the workspace and reports what it removed', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)
    await bindWorkspace(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE, projectId: project.id },
    })

    const removed = await unbindWorkspace(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE },
    })

    expect(removed?.projectId).toBe(project.id)
    expect(await deps.bindings.find(WORKSPACE)).toBeNull()
  })

  it('clears a stale binding whose project no longer resolves', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)
    await bindWorkspace(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE, projectId: project.id },
    })
    deps.projects.stored.clear()
    deps.members.members.clear()

    const removed = await unbindWorkspace(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE },
    })

    expect(removed?.projectId).toBe(project.id)
  })

  it('reports nothing removed rather than failing on an unbound workspace', async () => {
    const deps = dependencies()

    const removed = await unbindWorkspace(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE },
    })

    expect(removed).toBeNull()
    expect(deps.activity.events).toEqual([])
  })

  it('surfaces an edition that cannot detach a workspace', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)
    await bindWorkspace(deps, {
      actor: actor(),
      command: { workspace: WORKSPACE, projectId: project.id },
    })
    deps.bindings.removable = false

    const error = await caught(
      unbindWorkspace(deps, { actor: actor(), command: { workspace: WORKSPACE } }),
    )

    expect(error.code).toBe('CONFLICT')
  })
})
