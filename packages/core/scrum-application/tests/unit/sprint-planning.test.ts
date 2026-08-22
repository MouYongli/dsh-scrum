import { describe, expect, it } from 'vitest'
import {
  PROJECT_ROLE,
  SPRINT_STATUS,
  formatSprintId,
  toRevision,
  toTimestamp,
  type Sprint,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'
import {
  createSprint,
  getSprint,
  listSprints,
  planSprint,
  reschedule,
  startSprint,
  updateSprint,
  type StoredProject,
} from '@dsh-scrum/scrum-application'
import { NOW, OTHER_ID, actor, dependencies, type TestDependencies } from '../support/fakes.js'
import { item, memberWithRoles, project } from '../support/project.js'

const START = NOW
const END = toTimestamp('2026-09-05T09:00:00.000Z')

async function caught(run: Promise<unknown>): Promise<{ code?: string; details?: unknown }> {
  return (await run.catch((error: unknown) => error)) as { code?: string; details?: unknown }
}

async function sprint(deps: TestDependencies, stored: StoredProject): Promise<Sprint> {
  return await createSprint(deps, {
    actor: actor(),
    command: { projectId: stored.project.id, name: 'sprint one', startDate: START, endDate: END },
  })
}

async function running(
  deps: TestDependencies,
  stored: StoredProject,
): Promise<{ sprint: Sprint; items: readonly WorkItem[] }> {
  const planned = await sprint(deps, stored)
  const first = await item(deps, stored, { title: 'first' })
  const second = await item(deps, stored, { title: 'second' })
  const inSprint = await planSprint(deps, {
    actor: actor(),
    command: {
      projectId: stored.project.id,
      sprintId: planned.id,
      items: [first, second].map((created) => ({
        workItemId: created.id,
        expectedRevision: created.revision,
      })),
    },
  })
  const started = await startSprint(deps, {
    actor: actor(),
    command: {
      projectId: stored.project.id,
      sprintId: planned.id,
      expectedRevision: planned.revision,
    },
  })
  return { sprint: started, items: inSprint }
}

describe('createSprint', () => {
  it('creates a planned sprint and records it', async () => {
    const deps = dependencies()
    const stored = await project(deps)

    const created = await sprint(deps, stored)

    expect(created.id).toBe('sprint-1')
    expect(created.status).toBe(SPRINT_STATUS.planned)
    expect(deps.activity.events).toMatchObject([{ action: 'sprint.create', targetType: 'sprint' }])
  })

  it('asks for another identifier when the first one was taken', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    await sprint(deps, stored)
    deps.sprints.collisions = 1

    const second = await createSprint(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, name: 'sprint two', startDate: START, endDate: END },
    })

    expect(second.id).toBe('sprint-2')
  })

  it('gives up rather than asking forever when every identifier is taken', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    await sprint(deps, stored)
    deps.sprints.collisions = 10

    const error = await caught(
      createSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          name: 'sprint two',
          startDate: START,
          endDate: END,
        },
      }),
    )

    expect(error.code).toBe('CONFLICT')
    expect(deps.sprints.sprints.size).toBe(1)
  })

  it('refuses a sprint that ends before it starts', async () => {
    const deps = dependencies()
    const stored = await project(deps)

    const error = await caught(
      createSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          name: 'backwards',
          startDate: END,
          endDate: START,
        },
      }),
    )

    expect(error.code).toBe('VALIDATION')
  })
})

describe('startSprint', () => {
  it('refuses a second active sprint in the project', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    await running(deps, stored)
    const second = await createSprint(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, name: 'sprint two', startDate: START, endDate: END },
    })

    const error = await caught(
      startSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          sprintId: second.id,
          expectedRevision: second.revision,
        },
      }),
    )

    expect(error.code).toBe('VALIDATION')
    expect(deps.sprints.get(stored.project.id, second.id)?.status).toBe(SPRINT_STATUS.planned)
  })

  it('refuses a role without the transition permission', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const planned = await sprint(deps, stored)
    memberWithRoles(deps, stored, OTHER_ID, [PROJECT_ROLE.developer])

    const error = await caught(
      startSprint(deps, {
        actor: actor({ identityId: OTHER_ID }),
        command: {
          projectId: stored.project.id,
          sprintId: planned.id,
          expectedRevision: planned.revision,
        },
      }),
    )

    expect(error.code).toBe('FORBIDDEN')
  })
})

describe('listSprints', () => {
  it('lists the sprints of this project and no other', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const elsewhere = await project(deps)
    const mine = await sprint(deps, stored)
    await sprint(deps, elsewhere)

    const found = await listSprints(deps, {
      actor: actor(),
      command: { projectId: stored.project.id },
    })

    expect(found.map((each) => each.id)).toEqual([mine.id])
  })
})

describe('getSprint', () => {
  it('reads one sprint back', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const planned = await sprint(deps, stored)

    const found = await getSprint(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, sprintId: planned.id },
    })

    expect(found).toEqual(planned)
  })

  it('reports a sprint that is not there', async () => {
    const deps = dependencies()
    const stored = await project(deps)

    const error = await caught(
      getSprint(deps, {
        actor: actor(),
        command: { projectId: stored.project.id, sprintId: formatSprintId(9) },
      }),
    )

    expect(error.code).toBe('NOT_FOUND')
  })
})

describe('updateSprint and reschedule', () => {
  it('moves the dates of a sprint that has not started', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const planned = await sprint(deps, stored)
    const later = toTimestamp('2026-09-12T09:00:00.000Z')

    const moved = await reschedule(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: planned.id,
        expectedRevision: planned.revision,
        startDate: START,
        endDate: later,
      },
    })

    expect(moved.endDate).toBe(later)
    expect(moved.revision).toBe(planned.revision + 1)
    expect(deps.activity.events.at(-1)).toMatchObject({ action: 'sprint.reschedule' })
  })

  it('restates the goal while the sprint runs', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const { sprint: active } = await running(deps, stored)

    const updated = await updateSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: active.id,
        expectedRevision: active.revision,
        goal: 'ship the coupon flow',
      },
    })

    expect(updated.goal).toBe('ship the coupon flow')
  })

  it('refuses to move the dates of a sprint that has started', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const { sprint: active } = await running(deps, stored)

    const error = await caught(
      reschedule(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          sprintId: active.id,
          expectedRevision: active.revision,
          startDate: START,
          endDate: toTimestamp('2026-09-12T09:00:00.000Z'),
        },
      }),
    )

    expect(error.code).toBe('VALIDATION')
  })

  it('names the sprint and both revisions when the caller is out of date', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const planned = await sprint(deps, stored)

    const error = await caught(
      updateSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          sprintId: planned.id,
          expectedRevision: toRevision(planned.revision + 3),
          name: 'renamed',
        },
      }),
    )

    expect(error.code).toBe('CONFLICT')
    expect(error.details).toMatchObject({ entityType: 'sprint', entityId: planned.id })
  })
})
