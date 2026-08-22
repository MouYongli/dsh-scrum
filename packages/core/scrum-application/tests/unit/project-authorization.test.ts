import { describe, expect, it } from 'vitest'
import {
  PERMISSION,
  archiveProject,
  createDefaultProjectConfig,
  createOwnerMember,
  createProject,
  toProjectKey,
  toTenantId,
} from '@dsh-scrum/scrum-domain'
import { resolveProjectAuthorization } from '@dsh-scrum/scrum-application'
import { ACTOR_ID, NOW, actor, dependencies, testIds } from '../support/fakes.js'

function seeded() {
  const deps = dependencies()
  const project = createProject({
    ids: testIds(),
    tenantId: toTenantId('tnt_01K00000000000000000000001'),
    key: toProjectKey('SCR'),
    name: 'shop-service',
    createdBy: ACTOR_ID,
    now: NOW,
  })
  deps.projects.stored.set(project.id, {
    project,
    config: createDefaultProjectConfig(project.id, NOW),
  })
  deps.members.add(
    createOwnerMember({ ids: testIds(), projectId: project.id, identityId: ACTOR_ID, now: NOW }),
  )
  return { deps, project }
}

describe('project authorization', () => {
  it('grants the current user without any Harness session decision', async () => {
    const { deps, project } = seeded()

    const result = await resolveProjectAuthorization(deps, {
      actor: actor({ sessionId: null }),
      command: { projectId: project.id },
    })

    expect(result.permissions.has(PERMISSION.workItemWrite)).toBe(true)
    expect(result.projectArchived).toBe(false)
    expect(result.membership.mode).toBe('personal')
    expect(result.membership.roles).toHaveLength(5)
  })

  it('narrows an archived project to read permissions', async () => {
    const { deps, project } = seeded()
    deps.projects.stored.set(project.id, {
      project: archiveProject(project, NOW),
      config: createDefaultProjectConfig(project.id, NOW),
    })

    const result = await resolveProjectAuthorization(deps, {
      actor: actor(),
      command: { projectId: project.id },
    })

    expect(result.permissions.has(PERMISSION.projectView)).toBe(true)
    expect(result.permissions.has(PERMISSION.workItemWrite)).toBe(false)
    expect(result.projectArchived).toBe(true)
  })
})
