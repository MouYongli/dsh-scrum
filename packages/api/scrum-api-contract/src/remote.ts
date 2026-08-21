import { z } from 'zod'
import { SUPPORTED_API_VERSIONS, UnsupportedApiVersionError } from './version.js'

/** Stable protocol marker used before either side has selected an API version. */
export const REMOTE_PROTOCOL = 'dsh-scrum' as const

export const REMOTE_CAPABILITY = {
  core: 'scrum.core',
  collaboration: 'collaboration',
  rbac: 'rbac',
  realtime: 'realtime',
  auditBasic: 'audit.basic',
  auditAdvanced: 'audit.advanced',
  notifications: 'notifications',
  sso: 'sso',
  scim: 'scim',
} as const

// Capability names are intentionally open so an older plugin can ignore a
// capability introduced by a newer service instead of rejecting the handshake.
export const remoteCapabilitySchema = z.string().trim().min(1)

export const remotePrincipalSchema = z.object({
  id: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  permissions: z.array(z.string().trim().min(1)),
})

export const remoteHandshakeRequestSchema = z.object({
  protocol: z.literal(REMOTE_PROTOCOL),
  clientName: z.string().trim().min(1),
  clientVersion: z.string().trim().min(1),
  supportedApiVersions: z.array(z.int().positive()).min(1),
})

export const remoteHandshakeResponseSchema = z.object({
  protocol: z.literal(REMOTE_PROTOCOL),
  serviceName: z.string().trim().min(1),
  serviceVersion: z.string().trim().min(1),
  selectedApiVersion: z.int().positive(),
  capabilities: z.array(remoteCapabilitySchema),
  principal: remotePrincipalSchema,
})

export type RemoteCapability = z.infer<typeof remoteCapabilitySchema>
export type RemotePrincipal = z.infer<typeof remotePrincipalSchema>
export type RemoteHandshakeRequest = z.infer<typeof remoteHandshakeRequestSchema>
export type RemoteHandshakeResponse = z.infer<typeof remoteHandshakeResponseSchema>

export function createRemoteHandshakeRequest(
  clientName: string,
  clientVersion: string,
): RemoteHandshakeRequest {
  return remoteHandshakeRequestSchema.parse({
    protocol: REMOTE_PROTOCOL,
    clientName,
    clientVersion,
    supportedApiVersions: [...SUPPORTED_API_VERSIONS],
  })
}

/** Parses a handshake and rejects a service that selected a version the client did not offer. */
export function parseRemoteHandshakeResponse(
  request: RemoteHandshakeRequest,
  raw: unknown,
): RemoteHandshakeResponse {
  const response = remoteHandshakeResponseSchema.parse(raw)
  if (!request.supportedApiVersions.includes(response.selectedApiVersion)) {
    throw new UnsupportedApiVersionError(response.selectedApiVersion, {
      offeredVersions: request.supportedApiVersions,
    })
  }
  return response
}
