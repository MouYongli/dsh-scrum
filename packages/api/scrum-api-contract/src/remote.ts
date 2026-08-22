import { z } from 'zod'
import { CAPABILITIES, type Capability } from '@dsh-scrum/scrum-domain'
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

export const remoteTenantSchema = z.object({
  id: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
})

export const remoteProjectSchema = z.object({
  id: z.string().trim().min(1),
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
})

export const remoteConnectionProfileSchema = z.object({
  id: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
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
  edition: z.enum(['teams', 'enterprise']),
  tenant: remoteTenantSchema,
  selectedApiVersion: z.int().positive(),
  capabilities: z.array(remoteCapabilitySchema),
  principal: remotePrincipalSchema,
})

export type RemoteCapability = z.infer<typeof remoteCapabilitySchema>
export type RemotePrincipal = z.infer<typeof remotePrincipalSchema>
export type RemoteHandshakeRequest = z.infer<typeof remoteHandshakeRequestSchema>
export type RemoteHandshakeResponse = z.infer<typeof remoteHandshakeResponseSchema>
export type RemoteProject = z.infer<typeof remoteProjectSchema>
export type RemoteConnectionProfile = z.infer<typeof remoteConnectionProfileSchema>

export interface RemoteConnectionOffer {
  readonly connectionId: string
  readonly edition: 'teams' | 'enterprise'
  readonly serviceName: string
  readonly tenant: { readonly id: string; readonly displayName: string }
  readonly principal: { readonly id: string; readonly displayName: string }
  readonly capabilities: readonly Capability[]
  readonly projects: readonly RemoteProject[]
}

/** Known capabilities only; future service values remain inert in this client. */
export function recognizedCapabilities(values: readonly RemoteCapability[]): readonly Capability[] {
  const known = new Set<string>(CAPABILITIES)
  return values.filter((value): value is Capability => known.has(value))
}

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
