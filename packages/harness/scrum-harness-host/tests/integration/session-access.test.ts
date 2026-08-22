import { describe, expect, it } from 'vitest'
import { toProjectKey, toTenantId, toTimestamp } from '@dsh-scrum/scrum-domain'
import { ACCESS_MODE, createSessionAccess } from '@dsh-scrum/scrum-application'
import { createHostApi } from '@dsh-scrum/scrum-harness-host'
import {
  MemoryStore,
  WORKSPACE,
  harness,
  ownerOf,
  runtime,
  type HarnessSession,
} from '../support/runtime.js'

const NEW_PROJECT = {
  tenantId: toTenantId('tnt_01K00000000000000000000001'),
  key: toProjectKey('SCR'),
  name: 'shop-service',
}

const SESSION: HarnessSession = { id: 'session_1', workspaceId: WORKSPACE.id }

function api(store: MemoryStore, session: HarnessSession | null = SESSION) {
  return createHostApi(harness(WORKSPACE, session), runtime(store))
}

async function bound(store: MemoryStore): Promise<void> {
  const created = await api(store).initialise(NEW_PROJECT)
  store.owners.set(created.project.id, ownerOf(created.project.id))
}

async function caught(run: Promise<unknown>): Promise<{ code?: string }> {
  return (await run.catch((error: unknown) => error)) as { code?: string }
}

describe('session access through the host', () => {
  it('starts off, so an agent reaches nothing until somebody says so', async () => {
    const store = new MemoryStore()
    await bound(store)

    const resolved = await api(store).session()

    expect(resolved.mode).toBe(ACCESS_MODE.off)
    expect([...resolved.permissions]).toEqual([])
  })

  it('opens and then lowers, and the change is visible on the next call', async () => {
    const store = new MemoryStore()
    await bound(store)

    await api(store).setSessionAccess(ACCESS_MODE.write)
    const writing = await api(store).session()
    await api(store).setSessionAccess(ACCESS_MODE.read)
    const reading = await api(store).session()

    expect(writing.permissions.has('workItem.write')).toBe(true)
    expect(reading.permissions.has('workItem.write')).toBe(false)
    expect(reading.permissions.has('backlog.view')).toBe(true)
  })

  it('degrades a writing session as soon as the project is archived', async () => {
    const store = new MemoryStore()
    await bound(store)
    await api(store).setSessionAccess(ACCESS_MODE.write)

    await api(store).archive()
    const resolved = await api(store).session()

    expect(resolved.mode).toBe(ACCESS_MODE.write)
    expect(resolved.permissions.has('workItem.write')).toBe(false)
  })

  it('loses everything when the binding goes', async () => {
    const store = new MemoryStore()
    await bound(store)
    await api(store).setSessionAccess(ACCESS_MODE.write)

    await api(store).detach()
    const error = await caught(api(store).session())

    expect(error.code).toBe('VALIDATION')
  })

  it('refuses to decide about a session that is not open', async () => {
    const store = new MemoryStore()
    await bound(store)

    const error = await caught(api(store, null).setSessionAccess(ACCESS_MODE.write))

    expect(error.code).toBe('VALIDATION')
  })

  it('keeps one Harness installation answer out of another', async () => {
    const store = new MemoryStore()
    await bound(store)
    await api(store).setSessionAccess(ACCESS_MODE.write)
    store.sessions.set(
      'dsh_local_2/session_1',
      createSessionAccess({
        harnessInstanceId: 'dsh_local_2',
        sessionId: 'session_1',
        now: toTimestamp('2026-08-22T09:00:00.000Z'),
      }),
    )

    const here = await api(store).session()

    expect(here.mode).toBe(ACCESS_MODE.write)
    expect(store.sessions.get('dsh_local_2/session_1')?.accessMode).toBe(ACCESS_MODE.off)
  })
})
