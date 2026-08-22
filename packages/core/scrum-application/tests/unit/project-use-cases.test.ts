import { describe, expect, it } from 'vitest'
import {
  CAPABILITY,
  PERMISSION,
  PROJECT_ROLE,
  PROJECT_STATUS,
  createProjectMember,
  toProjectKey,
  toTenantId,
  toRevision,
  toTimestamp,
} from '@dsh-scrum/scrum-domain'
import {
  archiveProject,
  configureProject,
  createProject,
  getProject,
  restoreProject,
  type CreateProjectCommand,
  type StoredProject,
} from '@dsh-scrum/scrum-application'
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

const COMMAND: CreateProjectCommand = {
  tenantId: toTenantId('tnt_01K00000000000000000000001'),
  key: toProjectKey('SCR'),
  name: '  shop-service  ',
}

async function seed(deps: TestDependencies, key = 'k1'): Promise<StoredProject> {
  return await createProject(deps, { actor: actor(), command: COMMAND, idempotencyKey: key })
}

async function caught(run: Promise<unknown>): Promise<{ code?: string }> {
  return (await run.catch((error: unknown) => error)) as { code?: string }
}

describe('createProject', () => {
  it('creates the project, its configuration and its owner together', async () => {
    const deps = dependencies()

    const { project, config } = await seed(deps)

    expect(project.name).toBe('shop-service')
    expect(project.status).toBe(PROJECT_STATUS.active)
    expect(project.createdBy).toBe(ACTOR_ID)
    expect(config.projectId).toBe(project.id)
    // Every role, so a single-user installation satisfies the matrix rather
    // than being exempted from it.
    expect(deps.projects.owners.get(project.id)?.roles).toHaveLength(5)
  })

  it('records the creation with the actor and the source', async () => {
    const deps = dependencies()

    const { project } = await seed(deps)

    expect(deps.activity.events).toEqual([
      {
        action: 'project.create',
        targetType: 'project',
        targetId: project.id,
        revision: project.revision,
        at: NOW,
        actorId: ACTOR_ID,
        source: 'ui',
        sessionId: null,
      },
    ])
  })

  it('creates one project when the same call is retried', async () => {
    const deps = dependencies()

    const first = await seed(deps)
    const second = await seed(deps)

    expect(second.project.id).toBe(first.project.id)
    expect(deps.projects.stored.size).toBe(1)
    expect(deps.activity.events).toHaveLength(1)
  })

  it('creates two projects when the caller supplies no key', async () => {
    const deps = dependencies()

    await createProject(deps, { actor: actor(), command: COMMAND })
    await createProject(deps, { actor: actor(), command: COMMAND })

    expect(deps.projects.stored.size).toBe(2)
  })

  it('refuses when the installation does not provide the core capability', async () => {
    const deps = dependencies({ capabilities: capabilities(CAPABILITY.collaboration) })

    const error = await caught(seed(deps))

    expect(error.code).toBe('FORBIDDEN')
    expect(deps.projects.stored.size).toBe(0)
  })
})

describe('getProject', () => {
  it('reports the project with what the caller may do to it', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)
    deps.members.add(deps.projects.owners.get(project.id)!)

    const view = await getProject(deps, { actor: actor(), command: { projectId: project.id } })

    expect(view.project.id).toBe(project.id)
    expect(view.permissions.has(PERMISSION.projectArchive)).toBe(true)
  })

  it('refuses a caller who is not a member', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)

    const error = await caught(
      getProject(deps, {
        actor: actor({ identityId: OTHER_ID }),
        command: { projectId: project.id },
      }),
    )

    expect(error.code).toBe('FORBIDDEN')
  })

  it('records nothing, because a read is not a change', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)
    deps.members.add(deps.projects.owners.get(project.id)!)
    deps.activity.events.length = 0

    await getProject(deps, { actor: actor(), command: { projectId: project.id } })

    expect(deps.activity.events).toEqual([])
  })
})

describe('archiveProject', () => {
  async function seedWithOwner(deps: TestDependencies): Promise<StoredProject> {
    const stored = await seed(deps)
    deps.members.add(deps.projects.owners.get(stored.project.id)!)
    deps.clock.set(toTimestamp('2026-08-22T11:00:00.000Z'))
    return stored
  }

  it('archives through the repository and advances the revision by one', async () => {
    const deps = dependencies()
    const { project } = await seedWithOwner(deps)

    const archived = await archiveProject(deps, {
      actor: actor(),
      command: { projectId: project.id },
    })

    expect(archived.project.status).toBe(PROJECT_STATUS.archived)
    expect(archived.project.revision).toBe(project.revision + 1)
    expect(deps.projects.stored.get(project.id)?.project.status).toBe(PROJECT_STATUS.archived)
  })

  it('restores an archived project through the same permission', async () => {
    const deps = dependencies()
    const { project } = await seedWithOwner(deps)
    await archiveProject(deps, { actor: actor(), command: { projectId: project.id } })

    const restored = await restoreProject(deps, {
      actor: actor(),
      command: { projectId: project.id },
    })

    expect(restored.project.status).toBe(PROJECT_STATUS.active)
  })

  it('refuses a member whose roles do not carry it', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)
    deps.members.add(
      createProjectMember({
        ids: testIds(),
        projectId: project.id,
        identityId: OTHER_ID,
        roles: [PROJECT_ROLE.developer],
        now: NOW,
      }),
    )

    const error = await caught(
      archiveProject(deps, {
        actor: actor({ identityId: OTHER_ID }),
        command: { projectId: project.id },
      }),
    )

    expect(error.code).toBe('FORBIDDEN')
    expect(deps.projects.stored.get(project.id)?.project.status).toBe(PROJECT_STATUS.active)
  })

  it('archives once when the same call is retried', async () => {
    const deps = dependencies()
    const { project } = await seedWithOwner(deps)
    const request = {
      actor: actor(),
      command: { projectId: project.id },
      idempotencyKey: 'archive-1',
    }

    const first = await archiveProject(deps, request)
    const second = await archiveProject(deps, request)

    expect(second.project.revision).toBe(first.project.revision)
    expect(deps.activity.events.filter((event) => event.action === 'project.archive')).toHaveLength(
      1,
    )
  })

  it('reports a project that is not there', async () => {
    const deps = dependencies()
    const { project } = await seed(deps)
    deps.projects.stored.clear()

    const error = await caught(
      archiveProject(deps, { actor: actor(), command: { projectId: project.id } }),
    )

    expect(error.code).toBe('NOT_FOUND')
  })
})

describe('configureProject', () => {
  async function owned(deps: TestDependencies): Promise<StoredProject> {
    const stored = await seed(deps)
    deps.members.add(deps.projects.owners.get(stored.project.id)!)
    return stored
  }

  it('changes the settings and advances the configuration revision', async () => {
    const deps = dependencies()
    const stored = await owned(deps)

    const configured = await configureProject(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        expectedRevision: stored.config.revision,
        changes: { sprintLengthInDays: 3, definitionOfDone: ['reviewed'] },
      },
    })

    expect(configured.config.sprintLengthInDays).toBe(3)
    expect(configured.config.definitionOfDone).toEqual(['reviewed'])
    expect(configured.config.revision).toBe(stored.config.revision + 1)
    expect(deps.activity.events.at(-1)).toMatchObject({
      action: 'project.configure',
      targetType: 'projectConfig',
    })
  })

  it('names the configuration when the caller is out of date', async () => {
    const deps = dependencies()
    const stored = await owned(deps)

    const error = await caught(
      configureProject(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          expectedRevision: toRevision(stored.config.revision + 2),
          changes: { sprintLengthInDays: 3 },
        },
      }),
    )

    expect(error.code).toBe('CONFLICT')
    expect((error as { details: Record<string, unknown> }).details['entityType']).toBe(
      'projectConfig',
    )
  })

  it('refuses a role that may not configure the project', async () => {
    const deps = dependencies()
    const stored = await seed(deps)
    deps.members.add(
      createProjectMember({
        ids: testIds(),
        projectId: stored.project.id,
        identityId: OTHER_ID,
        roles: [PROJECT_ROLE.developer],
        now: NOW,
      }),
    )

    const error = await caught(
      configureProject(deps, {
        actor: actor({ identityId: OTHER_ID }),
        command: {
          projectId: stored.project.id,
          expectedRevision: stored.config.revision,
          changes: { sprintLengthInDays: 3 },
        },
      }),
    )

    expect(error.code).toBe('FORBIDDEN')
  })
})
