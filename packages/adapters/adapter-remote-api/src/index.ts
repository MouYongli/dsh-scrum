import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  createRemoteHandshakeRequest,
  parseRemoteHandshakeResponse,
  recognizedCapabilities,
  remoteProjectSchema,
  type RemoteHandshakeRequest,
  type RemoteConnectionOffer,
  type RemoteConnectionProfile,
} from '@dsh-scrum/scrum-api-contract'
import { z } from 'zod'

export type RemoteFailureKind = 'authentication' | 'compatibility' | 'network' | 'authorization'

export class RemoteConnectionError extends Error {
  readonly kind: RemoteFailureKind

  constructor(kind: RemoteFailureKind, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RemoteConnectionError'
    this.kind = kind
  }
}

/** Global profile: the credential reference is resolved outside the workspace. */
export interface StoredRemoteConnectionProfile {
  readonly id: string
  readonly displayName: string
  readonly endpoint: string
  readonly credentialRef: string
}

export interface RemoteProfileRepository {
  list(): Promise<readonly StoredRemoteConnectionProfile[]>
  find(id: string): Promise<StoredRemoteConnectionProfile | null>
}

export interface RemoteCredentialProvider {
  authorization(reference: string): Promise<string | null>
}

export interface RemoteTransportResponse {
  readonly status: number
  readonly body: unknown
}

export interface RemoteTransport {
  send(input: {
    readonly endpoint: string
    readonly path: '/handshake' | '/projects'
    readonly authorization: string
    readonly body: unknown
  }): Promise<RemoteTransportResponse>
}

export interface WorkspaceRemoteBinding {
  readonly connectionId: string
  readonly projectId: string
}

const bindingSchema = z.object({
  connectionId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
})
const projectsSchema = z.array(remoteProjectSchema)

export function remoteBindingPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.scrum', 'remote.json')
}

export async function readRemoteBinding(
  workspaceRoot: string,
): Promise<WorkspaceRemoteBinding | null> {
  try {
    return bindingSchema.parse(JSON.parse(await readFile(remoteBindingPath(workspaceRoot), 'utf8')))
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

async function writeRemoteBinding(
  workspaceRoot: string,
  binding: WorkspaceRemoteBinding,
): Promise<void> {
  const path = remoteBindingPath(workspaceRoot)
  const temporary = `${path}.tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(bindingSchema.parse(binding), null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  await rename(temporary, path)
}

export interface RemoteConnector {
  profiles(): Promise<readonly RemoteConnectionProfile[]>
  begin(connectionId: string): Promise<RemoteConnectionOffer>
  attach(
    workspaceRoot: string,
    connectionId: string,
    projectId: string,
  ): Promise<WorkspaceRemoteBinding>
}

export function createRemoteConnector(input: {
  readonly profiles: RemoteProfileRepository
  readonly credentials: RemoteCredentialProvider
  readonly transport: RemoteTransport
  readonly clientVersion: string
}): RemoteConnector {
  async function call(
    profile: StoredRemoteConnectionProfile,
    authorization: string,
    path: '/handshake' | '/projects',
    body: unknown,
  ): Promise<unknown> {
    let response: RemoteTransportResponse
    try {
      response = await input.transport.send({
        endpoint: profile.endpoint,
        path,
        authorization,
        body,
      })
    } catch (cause: unknown) {
      throw new RemoteConnectionError('network', 'the remote Scrum service could not be reached', {
        cause,
      })
    }
    if (response.status === 401) {
      throw new RemoteConnectionError('authentication', 'sign in to the remote Scrum service again')
    }
    if (response.status === 403) {
      throw new RemoteConnectionError('authorization', 'the remote service refused this operation')
    }
    if (response.status < 200 || response.status >= 300) {
      throw new RemoteConnectionError('network', `the remote service returned ${response.status}`)
    }
    return response.body
  }

  async function begin(connectionId: string): Promise<RemoteConnectionOffer> {
    const profile = await input.profiles.find(connectionId)
    if (profile === null) {
      throw new RemoteConnectionError('authentication', 'the connection profile is not configured')
    }
    const authorization = await input.credentials.authorization(profile.credentialRef)
    if (authorization === null) {
      throw new RemoteConnectionError('authentication', 'sign in to the remote Scrum service')
    }
    const request: RemoteHandshakeRequest = createRemoteHandshakeRequest(
      'dsh-scrum-plugin',
      input.clientVersion,
    )
    let handshake
    try {
      handshake = parseRemoteHandshakeResponse(
        request,
        await call(profile, authorization, '/handshake', request),
      )
    } catch (cause: unknown) {
      if (cause instanceof RemoteConnectionError) throw cause
      throw new RemoteConnectionError('compatibility', 'the remote service is not compatible', {
        cause,
      })
    }
    const projects = projectsSchema.parse(await call(profile, authorization, '/projects', {}))
    return {
      connectionId,
      edition: handshake.edition,
      serviceName: handshake.serviceName,
      tenant: handshake.tenant,
      principal: { id: handshake.principal.id, displayName: handshake.principal.displayName },
      capabilities: recognizedCapabilities(handshake.capabilities),
      projects,
    }
  }

  return {
    profiles: async () =>
      (await input.profiles.list()).map(({ id, displayName }) => ({ id, displayName })),
    begin,
    attach: async (workspaceRoot, connectionId, projectId) => {
      const offer = await begin(connectionId)
      if (!offer.projects.some((project) => project.id === projectId)) {
        throw new RemoteConnectionError(
          'authorization',
          'the selected project is not accessible to the current user',
        )
      }
      const binding = { connectionId, projectId }
      await writeRemoteBinding(workspaceRoot, binding)
      return binding
    },
  }
}
