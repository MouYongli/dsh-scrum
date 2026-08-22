import { describe, expect, it } from 'vitest'
import {
  PERMISSION,
  PROJECT_STATUS,
  type Permission,
  type ProjectStatus,
} from '@dsh-scrum/scrum-domain'
import { SCRUM_ACCESS_MODE, createSessionAccessController } from '@dsh-scrum/scrum-ui'
import type { AccessMode, ScrumClient, SessionView } from '@dsh-scrum/scrum-ui'
import { stubClient } from '../support/client.js'

// A stand-in for the host's session store: the mode is kept per session, and
// what a session may do is resolved from it on every read, exactly as
// `resolveSessionAuthorization` does.

const READS: readonly Permission[] = [PERMISSION.projectView, PERMISSION.backlogView]
const WRITES: readonly Permission[] = [...READS, PERMISSION.workItemWrite]

function host(projectStatus: ProjectStatus = PROJECT_STATUS.active) {
  const modes = new Map<string, AccessMode>()

  function resolve(sessionId: string): SessionView {
    const mode = modes.get(sessionId) ?? SCRUM_ACCESS_MODE.off
    const archived = projectStatus === PROJECT_STATUS.archived
    const permissions =
      mode === SCRUM_ACCESS_MODE.off
        ? []
        : mode === SCRUM_ACCESS_MODE.read || archived
          ? READS
          : WRITES
    return { mode, granted: WRITES, permissions, projectArchived: archived }
  }

  return {
    /** One client per session, the way one browser half serves one session. */
    clientFor: (sessionId: string): ScrumClient =>
      stubClient({
        session: () => Promise.resolve(resolve(sessionId)),
        setSessionAccess: (mode) => {
          modes.set(sessionId, mode)
          return Promise.resolve(resolve(sessionId))
        },
      }),
    modeOf: (sessionId: string): AccessMode => modes.get(sessionId) ?? SCRUM_ACCESS_MODE.off,
  }
}

describe('the mode a user picked', () => {
  it('survives a refresh, because it lives with the host and not on the page', async () => {
    const { clientFor } = host()
    const client = clientFor('session-1')

    const first = createSessionAccessController(client, () => true)
    await first.load()
    await first.setMode(SCRUM_ACCESS_MODE.write)

    // A refresh is a new controller over the same session.
    const second = createSessionAccessController(client, () => true)
    await second.load()

    expect(second.state().summary?.chosen).toBe(SCRUM_ACCESS_MODE.write)
    expect(second.state().summary?.effective).toBe(SCRUM_ACCESS_MODE.write)
  })

  it('starts off for a session nobody has decided about', async () => {
    const { clientFor } = host()
    const controller = createSessionAccessController(clientFor('session-fresh'), () => true)

    await controller.load()

    expect(controller.state().summary?.chosen).toBe(SCRUM_ACCESS_MODE.off)
  })
})

describe('two sessions open at once', () => {
  it('do not affect each other', async () => {
    const { clientFor, modeOf } = host()
    const one = createSessionAccessController(clientFor('session-1'), () => true)
    const two = createSessionAccessController(clientFor('session-2'), () => true)
    await one.load()
    await two.load()

    await one.setMode(SCRUM_ACCESS_MODE.write)
    await two.setMode(SCRUM_ACCESS_MODE.read)

    expect(modeOf('session-1')).toBe(SCRUM_ACCESS_MODE.write)
    expect(modeOf('session-2')).toBe(SCRUM_ACCESS_MODE.read)
    expect(one.state().summary?.effective).toBe(SCRUM_ACCESS_MODE.write)
    expect(two.state().summary?.effective).toBe(SCRUM_ACCESS_MODE.read)
  })
})

describe('a project that was archived under the session', () => {
  it('degrades write to read and says the archive is why', async () => {
    const { clientFor } = host(PROJECT_STATUS.archived)
    const controller = createSessionAccessController(clientFor('session-1'), () => true)
    await controller.load()

    await controller.setMode(SCRUM_ACCESS_MODE.write)

    expect(controller.state().summary?.chosen).toBe(SCRUM_ACCESS_MODE.write)
    expect(controller.state().summary?.effective).toBe(SCRUM_ACCESS_MODE.read)
    expect(controller.state().summary?.degradations).toEqual(['archived'])
  })
})
