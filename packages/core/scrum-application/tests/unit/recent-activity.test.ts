import { describe, expect, it } from 'vitest'
import { toProjectKey, toTenantId, toTimestamp } from '@dsh-scrum/scrum-domain'
import {
  ACTIVITY_SOURCE,
  createProject,
  recentActivity,
  type CreateProjectCommand,
  type StoredProject,
} from '@dsh-scrum/scrum-application'
import { ACTOR_ID, OTHER_ID, actor, dependencies, type TestDependencies } from '../support/fakes.js'

const COMMAND: CreateProjectCommand = {
  tenantId: toTenantId('tnt_01K00000000000000000000001'),
  key: toProjectKey('SCR'),
  name: 'shop-service',
}

async function seed(deps: TestDependencies): Promise<StoredProject> {
  const stored = await createProject(deps, { actor: actor(), command: COMMAND })
  deps.members.add(deps.projects.owners.get(stored.project.id)!)
  // Creating the project recorded one event of its own; the tests below are
  // about what they put in themselves.
  deps.activity.events.length = 0
  return stored
}

function record(deps: TestDependencies, at: string, targetId: string): void {
  deps.activity.events.push({
    at: toTimestamp(at),
    actorId: ACTOR_ID,
    source: ACTIVITY_SOURCE.ui,
    sessionId: null,
    action: 'workItem.update',
    targetType: 'workItem',
    targetId,
    revision: null,
  })
}

describe('recentActivity', () => {
  it('answers newest first, no more than the window asked for', async () => {
    const deps = dependencies()
    const project = await seed(deps)
    record(deps, '2026-09-01T10:00:00.000Z', 'SCR-1')
    record(deps, '2026-09-03T10:00:00.000Z', 'SCR-2')

    const history = await recentActivity(deps, {
      actor: actor(),
      command: { projectId: project.project.id, limit: 1 },
    })

    expect(history.events.map((event) => event.targetId)).toEqual(['SCR-2'])
  })

  it('narrows to what happened since an instant', async () => {
    const deps = dependencies()
    const project = await seed(deps)
    record(deps, '2026-08-01T10:00:00.000Z', 'SCR-1')
    record(deps, '2026-09-03T10:00:00.000Z', 'SCR-2')

    const history = await recentActivity(deps, {
      actor: actor(),
      command: {
        projectId: project.project.id,
        limit: 10,
        since: toTimestamp('2026-09-01T00:00:00.000Z'),
      },
    })

    expect(history.events.map((event) => event.targetId)).toEqual(['SCR-2'])
  })

  it('hands back what the log could not read rather than failing the read', async () => {
    const deps = dependencies()
    const project = await seed(deps)
    record(deps, '2026-09-01T10:00:00.000Z', 'SCR-1')
    deps.activity.problems.push('2026-09.jsonl:4 was cut short by an interrupted write')

    const history = await recentActivity(deps, {
      actor: actor(),
      command: { projectId: project.project.id, limit: 10 },
    })

    expect(history.events).toHaveLength(1)
    expect(history.problems).toHaveLength(1)
  })

  it('refuses somebody who cannot open the project', async () => {
    const deps = dependencies()
    const project = await seed(deps)

    const error = (await recentActivity(deps, {
      actor: actor({ identityId: OTHER_ID }),
      command: { projectId: project.project.id, limit: 10 },
    }).catch((thrown: unknown) => thrown)) as { code?: string }

    expect(error.code).toBe('FORBIDDEN')
  })

  it('records nothing, so reading the log does not become most of the log', async () => {
    const deps = dependencies()
    const project = await seed(deps)
    const before = deps.activity.events.length

    await recentActivity(deps, {
      actor: actor(),
      command: { projectId: project.project.id, limit: 10 },
    })

    expect(deps.activity.events).toHaveLength(before)
  })
})
