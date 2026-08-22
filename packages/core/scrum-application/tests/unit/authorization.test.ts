import { describe, expect, it } from 'vitest'
import {
  CAPABILITY,
  MEMBER_STATUS,
  PERMISSION,
  PROJECT_ROLE,
  createDefaultProjectConfig,
  createOwnerMember,
  createProject,
  createProjectMember,
  setMemberStatus,
  toProjectKey,
  toTenantId,
  type Project,
} from '@dsh-scrum/scrum-domain'
import { authorizeProject, resolvePermissions, loadProject } from '@dsh-scrum/scrum-application'
import {
  ACTOR_ID,
  NOW,
  OTHER_ID,
  actor,
  capabilities,
  dependencies,
  testIds,
  type TestDependencies,
} from '../support/fakes.js'

function seedProject(deps: TestDependencies): Project {
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
  return project
}

describe('loadProject', () => {
  it('reports a project that is not there rather than returning nothing', async () => {
    const deps = dependencies()
    const project = seedProject(deps)
    deps.projects.stored.clear()

    const error = await loadProject(deps, project.id).catch((caught: unknown) => caught)

    expect((error as { code: string }).code).toBe('NOT_FOUND')
  })
})

describe('resolvePermissions', () => {
  it('gives the owner every permission the edition allows', async () => {
    const deps = dependencies()
    const project = seedProject(deps)
    deps.members.add(
      createOwnerMember({ ids: testIds(), projectId: project.id, identityId: ACTOR_ID, now: NOW }),
    )

    const resolved = await resolvePermissions(
      deps,
      actor(),
      (await deps.projects.find(project.id))!,
    )

    expect(resolved.roles).toHaveLength(5)
    expect(resolved.permissions.has(PERMISSION.projectArchive)).toBe(true)
    // `member.manage` is the one permission gated on a capability Community
    // does not have, so the owner holds everything except it.
    expect(resolved.permissions.has(PERMISSION.memberManage)).toBe(false)
  })

  it('grants member management once the rbac capability is present', async () => {
    const deps = dependencies({ capabilities: capabilities(CAPABILITY.core, CAPABILITY.rbac) })
    const project = seedProject(deps)
    deps.members.add(
      createOwnerMember({ ids: testIds(), projectId: project.id, identityId: ACTOR_ID, now: NOW }),
    )

    const resolved = await resolvePermissions(
      deps,
      actor(),
      (await deps.projects.find(project.id))!,
    )

    expect(resolved.permissions.has(PERMISSION.memberManage)).toBe(true)
  })

  it('treats a non-member and a suspended member the same way', async () => {
    const deps = dependencies()
    const project = seedProject(deps)
    const member = createProjectMember({
      ids: testIds(),
      projectId: project.id,
      identityId: OTHER_ID,
      roles: [PROJECT_ROLE.administrator],
      now: NOW,
    })
    deps.members.add(setMemberStatus(member, MEMBER_STATUS.suspended, NOW))

    const stranger = await resolvePermissions(
      deps,
      actor(),
      (await deps.projects.find(project.id))!,
    )
    const suspended = await resolvePermissions(
      deps,
      actor({ identityId: OTHER_ID }),
      (await deps.projects.find(project.id))!,
    )

    expect([...stranger.permissions]).toEqual([])
    expect([...suspended.permissions]).toEqual([])
  })
})

describe('authorizeProject', () => {
  it('returns what it loaded so the use case does not read twice', async () => {
    const deps = dependencies()
    const project = seedProject(deps)
    deps.members.add(
      createOwnerMember({ ids: testIds(), projectId: project.id, identityId: ACTOR_ID, now: NOW }),
    )

    const authorized = await authorizeProject(deps, actor(), project.id, PERMISSION.projectView)

    expect(authorized.project).toEqual(project)
    expect(authorized.config.projectId).toBe(project.id)
  })

  it('refuses an actor whose roles do not carry the permission', async () => {
    const deps = dependencies()
    const project = seedProject(deps)
    deps.members.add(
      createProjectMember({
        ids: testIds(),
        projectId: project.id,
        identityId: ACTOR_ID,
        roles: [PROJECT_ROLE.stakeholder],
        now: NOW,
      }),
    )

    const error = await authorizeProject(
      deps,
      actor(),
      project.id,
      PERMISSION.projectArchive,
    ).catch((caught: unknown) => caught)

    expect((error as { code: string }).code).toBe('FORBIDDEN')
    expect((error as { details: Record<string, unknown> }).details['permission']).toBe(
      PERMISSION.projectArchive,
    )
  })
})
