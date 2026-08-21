import { describe, expect, it } from 'vitest'
import {
  API_VERSION,
  REMOTE_PROTOCOL,
  createRemoteHandshakeRequest,
  parseRemoteHandshakeResponse,
  remoteHandshakeResponseSchema,
} from '../../src/index.js'

describe('remote handshake contract', () => {
  it('advertises every API version supported by the plugin', () => {
    expect(createRemoteHandshakeRequest('dsh-scrum-plugin', '0.1.0')).toEqual({
      protocol: REMOTE_PROTOCOL,
      clientName: 'dsh-scrum-plugin',
      clientVersion: '0.1.0',
      supportedApiVersions: [API_VERSION],
    })
  })

  it('accepts unknown future capabilities without granting them locally', () => {
    const response = remoteHandshakeResponseSchema.parse({
      protocol: REMOTE_PROTOCOL,
      serviceName: 'dsh-scrum-server',
      serviceVersion: '0.1.0',
      selectedApiVersion: API_VERSION,
      capabilities: ['scrum.core', 'future.capability'],
      principal: {
        id: 'user-1',
        displayName: 'User One',
        permissions: ['project.read'],
      },
    })

    expect(response.capabilities).toContain('future.capability')
  })

  it('rejects a response that is not from the Scrum protocol', () => {
    expect(() =>
      remoteHandshakeResponseSchema.parse({
        protocol: 'other-service',
        serviceName: 'other',
        serviceVersion: '1.0.0',
        selectedApiVersion: API_VERSION,
        capabilities: [],
        principal: { id: 'user-1', displayName: 'User One', permissions: [] },
      }),
    ).toThrow()
  })

  it('rejects a service-selected version that the plugin did not offer', () => {
    const request = createRemoteHandshakeRequest('dsh-scrum-plugin', '0.1.0')

    expect(() =>
      parseRemoteHandshakeResponse(request, {
        protocol: REMOTE_PROTOCOL,
        serviceName: 'dsh-scrum-server',
        serviceVersion: '0.1.0',
        selectedApiVersion: 999,
        capabilities: ['scrum.core'],
        principal: { id: 'user-1', displayName: 'User One', permissions: [] },
      }),
    ).toThrow(/api version 999 is not supported/)
  })
})
