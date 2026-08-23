import { describe, expect, it } from 'vitest'
import { toTimestamp, type Sprint, type WorkItem } from '@dsh-scrum/scrum-domain'
import {
  createSprint,
  planSprint,
  startSprint,
  updateWorkItem,
  type StoredProject,
} from '@dsh-scrum/scrum-application'
import { actor, dependencies, type TestDependencies } from '../support/fakes.js'
import { item, project } from '../support/project.js'

/** Creation does not take an estimate, so a sized item is created then sized. */
async function sized(
  deps: TestDependencies,
  stored: StoredProject,
  title: string,
  estimate: number,
): Promise<WorkItem> {
  const created = await item(deps, stored, { title })
  return await updateWorkItem(deps, {
    actor: actor(),
    command: {
      projectId: stored.project.id,
      workItemId: created.id,
      expectedRevision: created.revision,
      changes: { estimate },
    },
  })
}

async function sprint(deps: TestDependencies, stored: StoredProject): Promise<Sprint> {
  return await createSprint(deps, {
    actor: actor(),
    command: {
      projectId: stored.project.id,
      name: '第一轮',
      startDate: toTimestamp('2026-08-24T09:00:00.000Z'),
      endDate: toTimestamp('2026-09-07T09:00:00.000Z'),
    },
  })
}

async function plan(
  deps: TestDependencies,
  stored: StoredProject,
  target: Sprint,
  items: readonly WorkItem[],
): Promise<readonly WorkItem[]> {
  return await planSprint(deps, {
    actor: actor(),
    command: {
      projectId: stored.project.id,
      sprintId: target.id,
      items: items.map((one) => ({ workItemId: one.id, expectedRevision: one.revision })),
    },
  })
}

describe('the commitment a sprint opens with', () => {
  it('records the items and the points, counting the unsized separately', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const estimated = await sized(deps, stored, 'sized', 5)
    const unsized = await item(deps, stored, { title: 'unsized' })
    const opening = await sprint(deps, stored)
    await plan(deps, stored, opening, [estimated, unsized])

    await startSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: opening.id,
        expectedRevision: opening.revision,
      },
    })

    expect(deps.sprintProgressLog.entries).toHaveLength(1)
    const [baseline] = deps.sprintProgressLog.entries
    expect(baseline?.kind).toBe('baseline')
    expect(baseline?.itemIds).toEqual([estimated.id, unsized.id])
    // An unsized item counts zero towards the total and is counted apart from
    // it, so a committed total is never quietly short of the work it covers.
    expect(baseline?.totalPoints).toBe(5)
    expect(baseline?.unestimatedCount).toBe(1)
  })

  it('does not move as items come and go afterwards', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const committed = await sized(deps, stored, 'committed', 3)
    const later = await sized(deps, stored, 'later', 8)
    const opening = await sprint(deps, stored)
    await plan(deps, stored, opening, [committed])
    const started = await startSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: opening.id,
        expectedRevision: opening.revision,
      },
    })

    await plan(deps, stored, started, [later])

    // The baseline describes one past moment rather than the present, which is
    // what lets scope change be a difference between the two at all.
    const [baseline] = await deps.sprintProgressLog.read(started.id)
    expect(baseline?.itemIds).toEqual([committed.id])
    expect(baseline?.totalPoints).toBe(3)
  })

  it('reports a baseline that could not be written, leaving the sprint open', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const opening = await sprint(deps, stored)
    deps.sprintProgressLog.failWith = new Error('the disk is full')

    const started = await startSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: opening.id,
        expectedRevision: opening.revision,
      },
    }).catch(() => null)

    // Not swallowed, for the reason activity is not: a sprint that opened
    // without a baseline can never be given one, so scope change is
    // unanswerable for it forever. The sprint is already active on disk, so a
    // caller told the write failed can simply retry the append.
    expect(started).toBeNull()
    expect((await deps.sprints.find(stored.project.id, opening.id))?.status).toBe('active')
    expect(deps.sprintProgressLog.entries).toEqual([])
  })
})
