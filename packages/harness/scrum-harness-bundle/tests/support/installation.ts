import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCommunityRuntime } from '@dsh-scrum/edition-community'
import {
  createAgentApi,
  createHostApi,
  type HarnessContext,
  type HarnessSession,
  type HarnessWorkspace,
  type ScrumAgentApi,
  type ScrumHostApi,
} from '@dsh-scrum/scrum-harness-host'

/**
 * A Community installation over a real directory, driven the way the shipped
 * bundle drives it.
 *
 * The Harness context is the one thing stubbed, and only because the host has
 * no way to read the open workspace and session for itself — see `todo.md`
 * A14. Everything below it is the code the bundle installs: the workspace file
 * store, the personal identity, the local activity log and the use cases.
 */
export interface Installation {
  readonly root: string
  readonly workspace: HarnessWorkspace
  readonly session: HarnessSession
  readonly host: ScrumHostApi
  agent(sessionId?: string): ScrumAgentApi
  dispose(): Promise<void>
}

export const INSTANCE = 'dsh_local_1'

export async function installation(label = 'acceptance'): Promise<Installation> {
  const root = await mkdtemp(join(tmpdir(), `dsh-scrum-${label}-`))
  const workspace: HarnessWorkspace = { id: 'ws_1', path: root, name: 'shop-service' }
  const session: HarnessSession = { id: 'session_1', workspaceId: workspace.id }
  const harness: HarnessContext = {
    instanceId: INSTANCE,
    currentWorkspace: async () => await Promise.resolve(workspace),
    currentSession: async () => await Promise.resolve(session),
  }
  const runtime = createCommunityRuntime()
  const host = createHostApi(harness, runtime)

  return {
    root,
    workspace,
    session,
    host,
    agent: (sessionId = session.id) => createAgentApi(harness, runtime, host, sessionId),
    dispose: async () => {
      await rm(root, { recursive: true, force: true })
    },
  }
}
