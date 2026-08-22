import { describe, expect, it } from 'vitest'
import { toProjectId, toProjectKey } from '@dsh-scrum/scrum-domain'
import { createHostApi, fingerprintWorkspacePath } from '@dsh-scrum/scrum-harness-host'
import {
  MemoryStore,
  WORKSPACE,
  harness,
  ownerOf,
  runtime,
  type HarnessSession,
  type HarnessWorkspace,
} from '../support/runtime.js'

// No tenant: the edition supplies one, so a client cannot name it.
const NEW_PROJECT = {
  key: toProjectKey('SCR'),
  name: 'shop-service',
}

function api(
  store: MemoryStore,
  workspace: HarnessWorkspace | null = WORKSPACE,
  session: HarnessSession | null = null,
) {
  return createHostApi(harness(workspace, session), runtime(store))
}

async function caught(run: Promise<unknown>): Promise<{ code?: string }> {
  return (await run.catch((error: unknown) => error)) as { code?: string }
}

describe('the five entry states', () => {
  it('reports no workspace when the user has not selected one', async () => {
    const entry = await api(new MemoryStore(), null).entry()

    expect(entry.state).toBe('no-workspace')
  })

  it('reports unbound for a workspace with no project', async () => {
    const entry = await api(new MemoryStore()).entry()

    expect(entry.state).toBe('unbound')
    expect(entry.state === 'unbound' && entry.workspace.name).toBe('shop-service')
  })

  it('reports bound once a project has been created here', async () => {
    const store = new MemoryStore()
    const created = await api(store).initialise(NEW_PROJECT)
    store.owners.set(created.project.id, ownerOf(created.project.id))

    const entry = await api(store).entry()

    expect(entry.state).toBe('bound')
    if (entry.state !== 'bound') {
      return
    }
    expect(entry.project.id).toBe(created.project.id)
    expect(entry.moved).toBe(false)
    expect(entry.permissions).toContain('project.archive')
  })

  it('reports archived once the project has been archived', async () => {
    const store = new MemoryStore()
    const created = await api(store).initialise(NEW_PROJECT)
    store.owners.set(created.project.id, ownerOf(created.project.id))
    await api(store).archive()

    const entry = await api(store).entry()

    expect(entry.state).toBe('archived')
  })

  it('reports stale when the bound project is no longer there', async () => {
    const store = new MemoryStore()
    await api(store).initialise(NEW_PROJECT)
    store.projects.clear()

    const entry = await api(store).entry()

    expect(entry.state).toBe('stale')
    expect(entry.state === 'stale' && entry.binding.projectId).toMatch(/^prj_/)
  })
})

describe('a workspace that has moved', () => {
  it('stays bound but says so', async () => {
    const store = new MemoryStore()
    const created = await api(store).initialise(NEW_PROJECT)
    store.owners.set(created.project.id, ownerOf(created.project.id))

    const entry = await api(store, { ...WORKSPACE, path: '/mnt/backup/shop-service' }).entry()

    expect(entry.state).toBe('bound')
    expect(entry.state === 'bound' && entry.moved).toBe(true)
  })

  it('keeps the binding through a rename, because the id is the reference', async () => {
    const store = new MemoryStore()
    const created = await api(store).initialise(NEW_PROJECT)
    store.owners.set(created.project.id, ownerOf(created.project.id))

    const entry = await api(store, { ...WORKSPACE, name: 'shop-service-renamed' }).entry()

    expect(entry.state).toBe('bound')
    expect(entry.state === 'bound' && entry.moved).toBe(false)
  })
})

describe('the session behind a change', () => {
  it('records a session that belongs to this workspace', async () => {
    const store = new MemoryStore()
    const session: HarnessSession = { id: 'session_1', workspaceId: WORKSPACE.id }
    const recorded: string[] = []
    const api = createHostApi(harness(WORKSPACE, session), {
      identity: runtime(store).identity,
      tenant: runtime(store).tenant,
      forWorkspace: async (workspace) => {
        const deps = await runtime(store).forWorkspace(workspace)
        return {
          ...deps,
          activity: {
            record: async (event) => {
              recorded.push(String(event.sessionId))
            },
          },
        }
      },
    })

    await api.initialise(NEW_PROJECT)

    expect(recorded).toContain('session_1')
  })

  it('records no session for one belonging to another workspace', async () => {
    const store = new MemoryStore()
    const session: HarnessSession = { id: 'session_1', workspaceId: 'ws_other' }
    const recorded: string[] = []
    const api = createHostApi(harness(WORKSPACE, session), {
      identity: runtime(store).identity,
      tenant: runtime(store).tenant,
      forWorkspace: async (workspace) => {
        const deps = await runtime(store).forWorkspace(workspace)
        return {
          ...deps,
          activity: {
            record: async (event) => {
              recorded.push(String(event.sessionId))
            },
          },
        }
      },
    })

    await api.initialise(NEW_PROJECT)

    // Naming an unrelated conversation is worse than naming none.
    expect(recorded).toEqual(['null', 'null'])
  })
})

describe('fingerprintWorkspacePath', () => {
  it('does not carry the path it was made from', () => {
    const fingerprint = fingerprintWorkspacePath('/home/alice/acme-unreleased')

    expect(fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(fingerprint).not.toContain('alice')
  })

  it('ignores a trailing separator, which is the same directory', () => {
    expect(fingerprintWorkspacePath('/home/me/shop/')).toBe(
      fingerprintWorkspacePath('/home/me/shop'),
    )
  })

  it('refuses a path with nothing in it', () => {
    expect(() => fingerprintWorkspacePath('   ')).toThrow(/must not be empty/)
  })
})

describe('binding through the host api', () => {
  it('attaches an existing project and detaches it again', async () => {
    const store = new MemoryStore()
    const created = await api(store).initialise(NEW_PROJECT)
    store.owners.set(created.project.id, ownerOf(created.project.id))

    const detached = await api(store).detach()
    const reattached = await api(store).attach(created.project.id)

    expect(detached?.projectId).toBe(created.project.id)
    expect(reattached.projectId).toBe(created.project.id)
    expect(reattached.pathFingerprint).toBe(fingerprintWorkspacePath(WORKSPACE.path))
  })

  it('refuses an operation that needs a project when nothing is bound', async () => {
    const error = await caught(api(new MemoryStore()).archive())

    expect(error.code).toBe('VALIDATION')
  })

  it('reports a missing project rather than a missing binding', async () => {
    const store = new MemoryStore()
    await api(store).initialise(NEW_PROJECT)
    store.projects.clear()

    const error = await caught(api(store).archive())

    expect(error.code).toBe('NOT_FOUND')
  })

  it('restores an archived project', async () => {
    const store = new MemoryStore()
    const created = await api(store).initialise(NEW_PROJECT)
    store.owners.set(created.project.id, ownerOf(created.project.id))
    await api(store).archive()

    const restored = await api(store).restore()

    expect(restored.project.status).toBe('active')
    expect((await api(store).entry()).state).toBe('bound')
  })

  it('refuses every operation when no workspace is selected', async () => {
    const error = await caught(
      api(new MemoryStore(), null).attach(toProjectId('prj_01K00000000000000000000001')),
    )

    expect(error.code).toBe('VALIDATION')
  })
})
