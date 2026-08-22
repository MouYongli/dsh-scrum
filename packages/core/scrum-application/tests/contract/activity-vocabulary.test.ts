import { describe, expect, it } from 'vitest'
import { toProjectKey, toTenantId } from '@dsh-scrum/scrum-domain'
import {
  ACTIVITY_SOURCES,
  archiveProject,
  bindWorkspace,
  createProject,
  restoreProject,
  toActivitySource,
  toWorkspaceRef,
  unbindWorkspace,
} from '@dsh-scrum/scrum-application'
import { actor, dependencies } from '../support/fakes.js'

// Activity is append-only history. A source or an action renamed after a
// project has recorded some is a line in the log that no longer means what it
// says, and nothing rewrites it. These may be added to and never renamed.

describe('activity source', () => {
  it('publishes exactly these sources', () => {
    expect([...ACTIVITY_SOURCES]).toEqual(['ui', 'agent', 'api', 'automation', 'system'])
  })

  it('refuses a source it does not publish', () => {
    expect(() => toActivitySource('ui ')).toThrow(/ActivitySource/)
  })
})

describe('activity actions', () => {
  it('names every project and workspace change with its published action', async () => {
    const deps = dependencies()
    const workspace = toWorkspaceRef('dsh_local_1', '/home/me/shop-service')
    const { project } = await createProject(deps, {
      actor: actor(),
      command: {
        tenantId: toTenantId('tnt_01K00000000000000000000001'),
        key: toProjectKey('SCR'),
        name: 'shop-service',
      },
    })
    deps.members.add(deps.projects.owners.get(project.id)!)
    const command = { projectId: project.id }

    await bindWorkspace(deps, { actor: actor(), command: { workspace, projectId: project.id } })
    await archiveProject(deps, { actor: actor(), command })
    await restoreProject(deps, { actor: actor(), command })
    await unbindWorkspace(deps, { actor: actor(), command: { workspace } })

    expect(deps.activity.events.map((event) => `${event.targetType} ${event.action}`)).toEqual([
      'project project.create',
      'workspace workspace.bind',
      'project project.archive',
      'project project.restore',
      'workspace workspace.unbind',
    ])
  })
})
