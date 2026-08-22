import { describe, expect, it } from 'vitest'
import {
  SPRINT_STATUS,
  WORK_ITEM_STATUS,
  toRevision,
  toTimestamp,
  type Sprint,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'
import {
  closeSprint,
  createSprint,
  planSprint,
  readSprintProgress,
  startSprint,
  type StoredProject,
} from '@dsh-scrum/scrum-application'
import { NOW, actor, dependencies, type TestDependencies } from '../support/fakes.js'
import { item, project } from '../support/project.js'

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

describe('closeSprint', () => {
  it('refuses when an unfinished item has no disposition, and says which', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const { sprint: active, items } = await running(deps, stored)

    const error = await caught(
      closeSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          sprintId: active.id,
          expectedRevision: active.revision,
          dispositions: [
            { workItemId: items[0]!.id, expectedRevision: items[0]!.revision, moveTo: null },
          ],
        },
      }),
    )

    expect(error.code).toBe('VALIDATION')
    expect(error.details).toMatchObject({ undecided: [items[1]!.id], unknown: [] })
    expect(deps.sprints.get(stored.project.id, active.id)?.status).toBe(SPRINT_STATUS.active)
  })

  it('refuses a disposition for an item the sprint does not hold', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const { sprint: active, items } = await running(deps, stored)
    const outside = await item(deps, stored, { title: 'outside' })

    const error = await caught(
      closeSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          sprintId: active.id,
          expectedRevision: active.revision,
          dispositions: [
            ...items.map((moved) => ({
              workItemId: moved.id,
              expectedRevision: moved.revision,
              moveTo: null,
            })),
            { workItemId: outside.id, expectedRevision: outside.revision, moveTo: null },
          ],
        },
      }),
    )

    expect(error.details).toMatchObject({ unknown: [outside.id] })
  })

  it('returns items to the backlog and carries others into the next sprint', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const { sprint: active, items } = await running(deps, stored)
    const next = await createSprint(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, name: 'sprint two', startDate: START, endDate: END },
    })

    const closed = await closeSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: active.id,
        expectedRevision: active.revision,
        resultSummary: 'the coupon flow slipped',
        dispositions: [
          { workItemId: items[0]!.id, expectedRevision: items[0]!.revision, moveTo: null },
          { workItemId: items[1]!.id, expectedRevision: items[1]!.revision, moveTo: next.id },
        ],
      },
    })

    expect(closed.status).toBe(SPRINT_STATUS.closed)
    expect(closed.resultSummary).toBe('the coupon flow slipped')
    expect(deps.workItems.items.get(items[0]!.id)?.sprintId).toBeNull()
    expect(deps.workItems.items.get(items[0]!.id)?.status).toBe(WORK_ITEM_STATUS.backlog)
    expect(deps.workItems.items.get(items[1]!.id)?.sprintId).toBe(next.id)
    expect(deps.transactions.applied).toContain('sprint.close')
  })

  it('refuses to carry an item into the sprint being closed', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const { sprint: active, items } = await running(deps, stored)

    const error = await caught(
      closeSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          sprintId: active.id,
          expectedRevision: active.revision,
          dispositions: items.map((moved) => ({
            workItemId: moved.id,
            expectedRevision: moved.revision,
            moveTo: active.id,
          })),
        },
      }),
    )

    expect(error.code).toBe('VALIDATION')
    expect((error as unknown as Error).message).toMatch(/carried into the sprint being closed/)
  })

  it('refuses a disposition carrying an out of date work item revision', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const { sprint: active, items } = await running(deps, stored)

    const error = await caught(
      closeSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          sprintId: active.id,
          expectedRevision: active.revision,
          dispositions: items.map((moved) => ({
            workItemId: moved.id,
            expectedRevision: toRevision(moved.revision + 2),
            moveTo: null,
          })),
        },
      }),
    )

    expect(error.code).toBe('CONFLICT')
    expect(error.details).toMatchObject({ entityType: 'workItem' })
  })

  it('leaves the items in the sprint when the sprint itself has moved on', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const { sprint: active, items } = await running(deps, stored)
    // The sprint changes after this caller read it, in the one window a
    // separate sprint write would move the items out of a sprint that then
    // fails to close.
    deps.writes.beforeNext = () => {
      deps.sprints.add({ ...active, revision: toRevision(active.revision + 1) })
    }

    const error = await caught(
      closeSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          sprintId: active.id,
          expectedRevision: active.revision,
          dispositions: items.map((moved) => ({
            workItemId: moved.id,
            expectedRevision: moved.revision,
            moveTo: null,
          })),
        },
      }),
    )

    expect(error.code).toBe('CONFLICT')
    expect(deps.workItems.items.get(items[0]!.id)?.sprintId).toBe(active.id)
    expect(deps.workItems.items.get(items[1]!.id)?.sprintId).toBe(active.id)
  })

  it('leaves the sprint open when a concurrent change lands before the batch', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const { sprint: active, items } = await running(deps, stored)
    deps.writes.beforeNext = () => {
      const stale = items[1]!
      deps.workItems.items.set(stale.id, { ...stale, revision: toRevision(stale.revision + 1) })
    }

    const error = await caught(
      closeSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          sprintId: active.id,
          expectedRevision: active.revision,
          dispositions: items.map((moved) => ({
            workItemId: moved.id,
            expectedRevision: moved.revision,
            moveTo: null,
          })),
        },
      }),
    )

    expect(error.code).toBe('CONFLICT')
    expect(deps.sprints.get(stored.project.id, active.id)?.status).toBe(SPRINT_STATUS.active)
    expect(deps.workItems.items.get(items[0]!.id)?.sprintId).toBe(active.id)
  })
})

describe('readSprintProgress', () => {
  it('counts by status and separates the unestimated items', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const { sprint: active, items } = await running(deps, stored)

    const progress = await readSprintProgress(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, sprintId: active.id },
    })

    expect(progress.total).toEqual({ count: items.length, estimate: 0 })
    expect(progress.byStatus[WORK_ITEM_STATUS.todo]).toEqual({ count: 2, estimate: 0 })
    expect(progress.finished).toEqual({ count: 0, estimate: 0 })
    expect(progress.unestimated).toBe(2)
  })

  it('ignores items belonging to another sprint or to none', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const { sprint: active } = await running(deps, stored)
    await item(deps, stored, { title: 'still in the backlog' })

    const progress = await readSprintProgress(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, sprintId: active.id },
    })

    expect(progress.total.count).toBe(2)
  })
})
