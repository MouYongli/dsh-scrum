import { describe, expect, it } from 'vitest'
import { SCRUM_ENDPOINT, createRequest, isErrorResponse } from '@dsh-scrum/scrum-api-contract'
import type { ApiResponse, ScrumScope } from '@dsh-scrum/scrum-api-contract'
import { createChannelHandler, createHostApi, scopedHarness } from '@dsh-scrum/scrum-harness-host'
import type { HarnessDirectory } from '@dsh-scrum/scrum-harness-host'
import type { RemoteConnectorPort } from '@dsh-scrum/scrum-harness-host'
import { MemoryStore, WORKSPACE, ownerOf, runtime } from '../support/runtime.js'

/**
 * The channel as the shell drives it: an endpoint name and a JSON payload in,
 * one envelope out. Nothing here reaches a socket — the transport's own
 * correlation and framing belong to the Harness — so what is asserted is the
 * part this package owns: what the endpoint resolves to, what the scope
 * selects, and what a failure looks like on the way back.
 */

const SESSION = { id: 'se_1', workspaceId: WORKSPACE.id }

function directory(): HarnessDirectory {
  return {
    instanceId: 'sha256:test',
    workspace: async (id) => (id === WORKSPACE.id ? WORKSPACE : null),
    session: async (id) => (id === SESSION.id ? SESSION : null),
  }
}

function handler(store: MemoryStore) {
  return createChannelHandler((scope) =>
    createHostApi(scopedHarness(directory(), scope), runtime(store)),
  )
}

const HERE: ScrumScope = { workspaceId: WORKSPACE.id, sessionId: SESSION.id }
const NOWHERE: ScrumScope = { workspaceId: null, sessionId: null }

async function call(
  store: MemoryStore,
  endpoint: string,
  input: unknown,
  scope: ScrumScope = HERE,
): Promise<ApiResponse<unknown>> {
  const result = await handler(store)(endpoint, createRequest({ scope, input }).data)
  expect(result.ok).toBe(true)
  return result.value as ApiResponse<unknown>
}

async function project(store: MemoryStore): Promise<void> {
  const created = await createHostApi(scopedHarness(directory(), HERE), runtime(store)).initialise({
    key: 'SCR',
    name: 'shop-service',
  } as never)
  store.owners.set(created.project.id, ownerOf(created.project.id))
}

describe('the scope', () => {
  it('selects the workspace the caller is looking at', async () => {
    const response = await call(new MemoryStore(), SCRUM_ENDPOINT.entry, {})

    expect(response).toMatchObject({ data: { state: 'unbound' } })
  })

  it('reports no workspace when the caller has selected none', async () => {
    const response = await call(new MemoryStore(), SCRUM_ENDPOINT.entry, {}, NOWHERE)

    expect(response).toMatchObject({ data: { state: 'no-workspace' } })
  })

  it('reports no workspace for an id the registry does not know', async () => {
    // A stale browser tab naming a workspace that has since been removed. It
    // is the same answer as having chosen nothing, not an error: the host
    // resolves the id rather than believing it.
    const response = await call(
      new MemoryStore(),
      SCRUM_ENDPOINT.entry,
      {},
      {
        workspaceId: 'ws_gone',
        sessionId: null,
      },
    )

    expect(response).toMatchObject({ data: { state: 'no-workspace' } })
  })
})

describe('the payload', () => {
  it('carries remote profiles, handshake context and authorized attachment through the host', async () => {
    const attached: unknown[] = []
    const remote: RemoteConnectorPort = {
      profiles: async () => [{ id: 'connection-1', displayName: 'Acme Scrum' }],
      begin: async () => ({
        connectionId: 'connection-1',
        edition: 'teams',
        serviceName: 'Acme Scrum',
        tenant: { id: 'tenant-1', displayName: 'Acme' },
        principal: { id: 'user-1', displayName: 'Ada' },
        capabilities: ['scrum.core'],
        projects: [{ id: 'project-1', key: 'SCR', name: 'Platform' }],
      }),
      attach: async (...input) => {
        attached.push(input)
      },
    }
    const channel = createChannelHandler((scope) =>
      createHostApi(scopedHarness(directory(), scope), runtime(new MemoryStore()), remote),
    )
    const send = async (endpoint: string, input: unknown) =>
      (await channel(endpoint, createRequest({ scope: HERE, input }).data))
        .value as ApiResponse<unknown>

    expect(await send(SCRUM_ENDPOINT.remoteProfiles, {})).toMatchObject({
      data: [{ id: 'connection-1' }],
    })
    expect(await send(SCRUM_ENDPOINT.remoteBegin, { connectionId: 'connection-1' })).toMatchObject({
      data: { edition: 'teams', projects: [{ id: 'project-1' }] },
    })
    await send(SCRUM_ENDPOINT.remoteAttach, {
      connectionId: 'connection-1',
      projectId: 'project-1',
    })
    expect(attached).toEqual([[WORKSPACE.path, 'connection-1', 'project-1']])
  })

  it('preserves the remote failure category without forwarding service details', async () => {
    const remote: RemoteConnectorPort = {
      profiles: async () => {
        throw Object.assign(new Error('token for /private/customer expired'), {
          kind: 'authentication',
        })
      },
      begin: async () => Promise.reject(new Error('unused')),
      attach: async () => Promise.reject(new Error('unused')),
    }
    const channel = createChannelHandler((scope) =>
      createHostApi(scopedHarness(directory(), scope), runtime(new MemoryStore()), remote),
    )
    const response = (
      await channel(SCRUM_ENDPOINT.remoteProfiles, createRequest({ scope: HERE, input: {} }).data)
    ).value as ApiResponse<unknown>

    expect(response).toMatchObject({
      error: {
        message: 'remote Scrum authentication failure',
        details: { remoteFailure: 'authentication' },
      },
    })
    expect(JSON.stringify(response)).not.toContain('token for')
    expect(JSON.stringify(response)).not.toContain('/private/customer')
  })

  it('carries the workspace name and not its path', async () => {
    const response = await call(new MemoryStore(), SCRUM_ENDPOINT.entry, {})
    const data = (response as { data: { workspace: Record<string, unknown> } }).data

    expect(data.workspace).toEqual({ id: WORKSPACE.id, name: WORKSPACE.name })
    // `.scrum/` is committed to the user's repository as often as not, and the
    // interface shows a name; the directory layout has no business on the wire.
    expect(JSON.stringify(response)).not.toContain(WORKSPACE.path)
  })

  it('answers a created project with what a screen renders', async () => {
    const response = await call(new MemoryStore(), SCRUM_ENDPOINT.createProject, {
      key: 'SCR',
      name: 'shop-service',
    })

    expect(response).toMatchObject({ data: { key: 'SCR', name: 'shop-service' } })
  })

  it('spells effective permissions as an array, which sets do not survive JSON as', async () => {
    const store = new MemoryStore()
    await project(store)

    const response = await call(store, SCRUM_ENDPOINT.authorization, {})
    const data = (response as { data: { permissions: unknown } }).data

    expect(Array.isArray(data.permissions)).toBe(true)
  })
})

describe('a failure', () => {
  it('travels as an error envelope rather than a rejected call', async () => {
    // The transport's error codes are the shell's closed union, with no room
    // for a domain refusal. Folding one into `internal` would throw away the
    // code, the message and the details at the one boundary that must keep them.
    const store = new MemoryStore()
    const response = await call(store, SCRUM_ENDPOINT.backlog, {})

    expect(isErrorResponse(response)).toBe(true)
    expect(response).toMatchObject({ error: { code: 'VALIDATION' } })
  })

  it('names the endpoint when the payload does not fit it', async () => {
    const response = await call(new MemoryStore(), SCRUM_ENDPOINT.createWorkItem, {
      type: 'chore',
      title: 'x',
    })

    expect(response).toMatchObject({ error: { code: 'VALIDATION' } })
  })

  it('refuses an endpoint the contract does not declare', async () => {
    const response = await call(new MemoryStore(), 'workItem.delete', {})

    expect(response).toMatchObject({ error: { code: 'VALIDATION' } })
  })

  it('refuses a call whose shell is not a scope at all', async () => {
    const result = await handler(new MemoryStore())(SCRUM_ENDPOINT.entry, { nonsense: true })

    expect(result.ok).toBe(true)
    expect(isErrorResponse(result.value as ApiResponse<unknown>)).toBe(true)
  })
})
