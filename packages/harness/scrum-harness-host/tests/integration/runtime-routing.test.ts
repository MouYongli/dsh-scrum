import { describe, expect, it } from 'vitest'
import { toProjectKey } from '@dsh-scrum/scrum-domain'
import {
  createHostApi,
  fixedRuntimeResolver,
  remoteRuntimeTarget,
  resolveRequest,
  type HarnessContext,
  type HarnessWorkspace,
  type WorkspaceRuntimeResolver,
} from '@dsh-scrum/scrum-harness-host'
import { MemoryStore, harness, runtime } from '../support/runtime.js'

const FIRST: HarnessWorkspace = {
  id: 'ws_local',
  path: '/home/me/local',
  name: 'local',
}
const SECOND: HarnessWorkspace = {
  id: 'ws_remote',
  path: '/home/me/remote',
  name: 'remote',
}

const NEW_PROJECT = { key: toProjectKey('SCR'), name: 'Scrum' }

function selectableHarness(selected: () => HarnessWorkspace): HarnessContext {
  return {
    instanceId: 'dsh_local_1',
    currentWorkspace: async () => selected(),
    currentSession: async () => null,
  }
}

describe('workspace runtime routing', () => {
  it('keeps Community-style local composition zero configuration', async () => {
    const request = await resolveRequest(
      harness(FIRST),
      fixedRuntimeResolver(runtime(new MemoryStore())),
    )

    expect(request.target).toEqual({ kind: 'local' })
  })

  it('describes a remote target with references and no credentials', () => {
    const target = remoteRuntimeTarget('conn_team_1', 'remote_project_1')

    expect(target).toEqual({
      kind: 'remote',
      connectionId: 'conn_team_1',
      projectId: 'remote_project_1',
    })
    expect(JSON.stringify(target)).not.toMatch(/token|secret|password|credential/i)
    expect(() => remoteRuntimeTarget('', 'remote_project_1')).toThrow(/requires connection/)
  })

  it('routes local and remote workspaces independently in one Harness instance', async () => {
    const local = new MemoryStore()
    const remote = new MemoryStore()
    let selected = FIRST
    const resolver: WorkspaceRuntimeResolver = {
      resolve: async (workspace) =>
        workspace.id === FIRST.id
          ? { target: { kind: 'local' }, runtime: runtime(local) }
          : {
              target: remoteRuntimeTarget('conn_enterprise_1', 'remote_project_1'),
              runtime: runtime(remote),
            },
    }
    const api = createHostApi(
      selectableHarness(() => selected),
      resolver,
    )

    const localProject = await api.initialise({ ...NEW_PROJECT, name: 'Local Scrum' })
    selected = SECOND
    const remoteProject = await api.initialise({ ...NEW_PROJECT, name: 'Remote Scrum' })

    expect([...local.projects.values()].map(({ project }) => project.name)).toEqual(['Local Scrum'])
    expect([...remote.projects.values()].map(({ project }) => project.name)).toEqual([
      'Remote Scrum',
    ])
    expect(localProject.project.name).not.toBe(remoteProject.project.name)
  })
})
