import { describe, expect, it } from 'vitest'
import {
  SCRUM_CHANNEL,
  SCRUM_ENDPOINT,
  errorResponse,
  successResponse,
  type ScrumScope,
} from '@dsh-scrum/scrum-api-contract'
import { ConflictError } from '@dsh-scrum/scrum-domain'
import { toFailure } from '@dsh-scrum/scrum-ui'
import {
  createTransportClient,
  type RpcCall,
  type RpcOutcome,
} from '@dsh-scrum/scrum-harness-client/client'

/**
 * The client half against a transport, without a shell.
 *
 * What is asserted is the part this package owns: what goes onto the channel,
 * what comes back off it, and what a failure becomes by the time a screen
 * sees it.
 */

const SCOPE: ScrumScope = { workspaceId: 'ws_1', sessionId: 'se_1' }

interface Sent {
  readonly channel: string
  readonly endpoint: string
  readonly payload: { scope: ScrumScope; input: unknown }
}

function transport(answer: (endpoint: string) => RpcOutcome): {
  readonly call: RpcCall
  readonly sent: Sent[]
} {
  const sent: Sent[] = []
  return {
    sent,
    call: async (channel, endpoint, payload) => {
      sent.push({ channel, endpoint, payload: payload as Sent['payload'] })
      return answer(endpoint)
    },
  }
}

function answering(value: unknown): (endpoint: string) => RpcOutcome {
  return () => ({ ok: true, value: successResponse(value) })
}

describe('what goes onto the channel', () => {
  it('sends the plugin own channel and the endpoint the contract names', async () => {
    const wire = transport(answering({ state: 'no-workspace' }))
    await createTransportClient(wire.call, () => SCOPE).entry()

    expect(wire.sent[0]?.channel).toBe(SCRUM_CHANNEL)
    expect(wire.sent[0]?.endpoint).toBe(SCRUM_ENDPOINT.entry)
  })

  it('reads the scope on every call rather than capturing it once', async () => {
    let scope: ScrumScope = { workspaceId: 'ws_1', sessionId: null }
    const wire = transport(answering({ state: 'no-workspace' }))
    const client = createTransportClient(wire.call, () => scope)

    await client.entry()
    // What switching workspace in the sidebar does between two calls.
    scope = { workspaceId: 'ws_2', sessionId: 'se_9' }
    await client.entry()

    expect(wire.sent.map((call) => call.payload.scope.workspaceId)).toEqual(['ws_1', 'ws_2'])
  })

  it('sends an empty filter for a backlog read with no query', async () => {
    const wire = transport(answering([]))
    await createTransportClient(wire.call, () => SCOPE).backlog()

    expect(wire.sent[0]?.payload.input).toEqual({})
  })

  it('sends the selected profile and project through the remote onboarding endpoints', async () => {
    const wire = transport(answering(undefined))
    const client = createTransportClient(wire.call, () => SCOPE)

    await client.attachRemote('connection-1', 'project-1')

    expect(wire.sent[0]).toMatchObject({
      endpoint: SCRUM_ENDPOINT.remoteAttach,
      payload: { input: { connectionId: 'connection-1', projectId: 'project-1' } },
    })
  })
})

describe('what comes back', () => {
  it('projects the entry payload onto the view the screens read', async () => {
    const wire = transport(
      answering({
        state: 'bound',
        workspace: { id: 'ws_1', name: 'shop-service' },
        project: { id: 'prj_1', key: 'SCR', name: 'shop', description: '' },
        moved: false,
      }),
    )

    const entry = await createTransportClient(wire.call, () => SCOPE).entry()

    expect(entry).toEqual({
      state: 'bound',
      workspace: { id: 'ws_1', name: 'shop-service' },
      project: { id: 'prj_1', key: 'SCR', name: 'shop', description: '' },
      moved: false,
    })
  })

  it('drops the binding from a stale entry, which no screen can act on', async () => {
    const wire = transport(
      answering({ state: 'stale', workspace: { id: 'ws_1', name: 'shop-service' } }),
    )

    const entry = await createTransportClient(wire.call, () => SCOPE).entry()

    expect(entry).toEqual({ state: 'stale', workspace: { id: 'ws_1', name: 'shop-service' } })
  })
})

describe('a failure', () => {
  it('arrives as the failure the interface reacts to, not an unknown one', async () => {
    const wire = transport(() => ({
      ok: true,
      value: errorResponse(new ConflictError('work item was modified', 3, 4)),
    }))
    const client = createTransportClient(wire.call, () => SCOPE)

    const error = await client.sprints().catch((thrown: unknown) => thrown)

    // A conflict is the one failure with a next step the user can take, so it
    // has to survive the wire as a conflict rather than as a plain Error.
    expect(toFailure(error).kind).toBe('conflict')
  })

  it('keeps the message the host sent', async () => {
    const wire = transport(() => ({
      ok: true,
      value: errorResponse(new ConflictError('somebody changed this first', 1, 2)),
    }))

    const error = await createTransportClient(wire.call, () => SCOPE)
      .sprints()
      .catch((thrown: unknown) => thrown)

    expect(toFailure(error).message).toBe('somebody changed this first')
  })

  it('reports a transport failure as one, rather than as a domain refusal', async () => {
    const wire = transport(() => ({
      ok: false,
      error: { code: 'unavailable', message: 'the host is not answering' },
    }))

    const error = await createTransportClient(wire.call, () => SCOPE)
      .entry()
      .catch((thrown: unknown) => thrown)

    expect(toFailure(error).kind).toBe('other')
    expect((error as { details: Record<string, unknown> }).details).toEqual({
      transport: 'unavailable',
    })
  })

  it('refuses an answer from a version this build does not speak', async () => {
    const wire = transport(() => ({
      ok: true,
      value: { apiVersion: 99, data: { state: 'no-workspace' } },
    }))

    const error = await createTransportClient(wire.call, () => SCOPE)
      .entry()
      .catch((thrown: unknown) => thrown)

    expect(error).toMatchObject({ code: 'UNSUPPORTED_API_VERSION' })
  })
})
