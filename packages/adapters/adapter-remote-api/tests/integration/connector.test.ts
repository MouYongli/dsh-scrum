import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_VERSION, REMOTE_PROTOCOL } from '@dsh-scrum/scrum-api-contract'
import {
  RemoteConnectionError,
  createRemoteConnector,
  readRemoteBinding,
  remoteBindingPath,
  type RemoteTransport,
} from '@dsh-scrum/adapter-remote-api'

const HANDSHAKE = {
  protocol: REMOTE_PROTOCOL,
  serviceName: 'Acme Scrum',
  serviceVersion: '2.4.0',
  edition: 'enterprise',
  tenant: { id: 'tenant-acme', displayName: 'Acme Engineering' },
  selectedApiVersion: API_VERSION,
  capabilities: ['scrum.core', 'rbac', 'future.policy'],
  principal: { id: 'user-1', displayName: 'Ada', permissions: ['project.view'] },
} as const

const PROJECTS = [{ id: 'project-1', key: 'SCR', name: 'Platform' }]
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })))
})

function connector(transport: RemoteTransport, authorization: string | null = 'Bearer private') {
  return createRemoteConnector({
    profiles: {
      list: async () => [
        {
          id: 'connection-1',
          displayName: 'Acme Scrum',
          endpoint: 'https://scrum.acme.test',
          credentialRef: 'keychain:acme',
        },
      ],
      find: async (id) =>
        id === 'connection-1'
          ? {
              id,
              displayName: 'Acme Scrum',
              endpoint: 'https://scrum.acme.test',
              credentialRef: 'keychain:acme',
            }
          : null,
    },
    credentials: { authorization: async () => authorization },
    transport,
    clientVersion: '0.1.0',
  })
}

function service(
  input: {
    readonly handshake?: unknown
    readonly projects?: unknown
    readonly projectStatus?: number
  } = {},
): RemoteTransport {
  return {
    send: vi.fn(async (request) => ({
      status: request.path === '/projects' ? (input.projectStatus ?? 200) : 200,
      body:
        request.path === '/handshake'
          ? (input.handshake ?? HANDSHAKE)
          : (input.projects ?? PROJECTS),
    })),
  }
}

describe('remote Scrum connection', () => {
  it('uses the handshake for identity, tenant, edition and known capabilities', async () => {
    const transport = service()
    const connected = connector(transport)
    expect(await connected.profiles()).toEqual([{ id: 'connection-1', displayName: 'Acme Scrum' }])
    const offer = await connected.begin('connection-1')

    expect(offer).toMatchObject({
      edition: 'enterprise',
      serviceName: 'Acme Scrum',
      tenant: HANDSHAKE.tenant,
      principal: { id: 'user-1', displayName: 'Ada' },
      capabilities: ['scrum.core', 'rbac'],
      projects: PROJECTS,
    })
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ authorization: 'Bearer private' }),
    )
  })

  it('attaches only an accessible project and stores no credential', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-scrum-remote-'))
    roots.push(root)

    await connector(service()).attach(root, 'connection-1', 'project-1')

    expect(await readRemoteBinding(root)).toEqual({
      connectionId: 'connection-1',
      projectId: 'project-1',
    })
    const stored = await readFile(remoteBindingPath(root), 'utf8')
    expect(Object.keys(JSON.parse(stored) as object).sort()).toEqual(['connectionId', 'projectId'])
    expect(stored).not.toMatch(/credential|authorization|token|secret|password/i)
  })

  it('refuses a project absent from the principal project list', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-scrum-remote-'))
    roots.push(root)

    await expect(
      connector(service()).attach(root, 'connection-1', 'project-other'),
    ).rejects.toMatchObject({
      kind: 'authorization',
    })
    expect(await readRemoteBinding(root)).toBeNull()
  })

  it.each([
    ['authentication', () => connector(service(), null).begin('connection-1')],
    ['authorization', () => connector(service({ projectStatus: 403 })).begin('connection-1')],
    [
      'compatibility',
      () =>
        connector(service({ handshake: { ...HANDSHAKE, selectedApiVersion: 999 } })).begin(
          'connection-1',
        ),
    ],
  ])('reports %s failures distinctly', async (kind, operation) => {
    await expect(operation()).rejects.toMatchObject({ kind })
  })

  it('reports transport exceptions as network failures', async () => {
    const transport: RemoteTransport = { send: async () => await Promise.reject(new Error('down')) }

    await expect(connector(transport).begin('connection-1')).rejects.toEqual(
      expect.objectContaining<Partial<RemoteConnectionError>>({ kind: 'network' }),
    )
  })
})
