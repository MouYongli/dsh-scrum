import { describe, expect, it } from 'vitest'
import {
  WORK_ITEM_RESOLUTION,
  WORK_ITEM_STATUS,
  toTimestamp,
  type Sprint,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'
import {
  createSprint,
  moveWorkItemStatus,
  planSprint,
  sprintProgress,
  readSprintReport,
  sprintScopeChange,
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

describe('scope change against the commitment', () => {
  it('reports what came in and what went out', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const kept = await sized(deps, stored, 'kept', 3)
    const dropped = await sized(deps, stored, 'dropped', 2)
    const opening = await sprint(deps, stored)
    await plan(deps, stored, opening, [kept, dropped])
    const started = await startSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: opening.id,
        expectedRevision: opening.revision,
      },
    })

    const arrived = await sized(deps, stored, 'arrived', 8)
    await plan(deps, stored, started, [arrived])
    const current = await deps.workItems.list(stored.project.id, {})
    await planSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: null,
        items: [
          {
            workItemId: dropped.id,
            expectedRevision: current.find((one) => one.id === dropped.id)!.revision,
          },
        ],
      },
    })

    const [baseline] = await deps.sprintProgressLog.read(started.id)
    const change = sprintScopeChange(baseline!, await deps.workItems.list(stored.project.id, {}))

    // Both directions, because a review has to explain both. Reporting only
    // what arrived would let a sprint shed half its commitment and still read
    // as having grown.
    expect(change.added).toEqual([arrived.id])
    expect(change.removed).toEqual([dropped.id])
    expect(change.committedPoints).toBe(5)
  })

  it('reports nothing changed when nothing did', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const only = await sized(deps, stored, 'only', 5)
    const opening = await sprint(deps, stored)
    await plan(deps, stored, opening, [only])
    const started = await startSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: opening.id,
        expectedRevision: opening.revision,
      },
    })

    const [baseline] = await deps.sprintProgressLog.read(started.id)
    const change = sprintScopeChange(baseline!, await deps.workItems.list(stored.project.id, {}))

    expect(change).toEqual({
      sprintId: started.id,
      added: [],
      removed: [],
      committedPoints: 5,
    })
  })
})

describe('what a sprint delivered', () => {
  it('counts only work that ended as done towards delivery', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const shipped = await sized(deps, stored, 'shipped', 5)
    const abandoned = await sized(deps, stored, 'abandoned', 8)
    const opening = await sprint(deps, stored)
    const planned = await plan(deps, stored, opening, [shipped, abandoned])
    await startSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: opening.id,
        expectedRevision: opening.revision,
      },
    })

    for (const [one, resolution] of [
      [planned[0]!, WORK_ITEM_RESOLUTION.done],
      [planned[1]!, WORK_ITEM_RESOLUTION.wontFix],
    ] as const) {
      await moveWorkItemStatus(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          workItemId: one.id,
          expectedRevision: one.revision,
          status: WORK_ITEM_STATUS.done,
          resolution,
        },
      })
    }
    const progress = sprintProgress(opening.id, await deps.workItems.list(stored.project.id, {}))

    // Both items left the board; only one was delivered. Velocity is a claim
    // about what a team can deliver, so a sprint closed by abandoning half of
    // it must not read as having gone faster.
    expect(progress.finished).toEqual({ count: 2, estimate: 13 })
    expect(progress.delivered).toEqual({ count: 1, estimate: 5 })
  })
})

describe('the report a screen reads', () => {
  it('says a planned sprint has no commitment yet rather than a commitment of zero', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const opening = await sprint(deps, stored)

    const report = await readSprintReport(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, sprintId: opening.id },
    })

    // Zero would read as a sprint that promised nothing, which is a different
    // claim from one that has not promised anything yet.
    expect(report.baseline).toBeNull()
    expect(report.scopeChange).toBeNull()
    expect(report.progress.total.count).toBe(0)
  })

  it('carries the progress and what changed since the start in one read', async () => {
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

    const report = await readSprintReport(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, sprintId: started.id },
    })

    expect(report.progress.total).toEqual({ count: 2, estimate: 11 })
    expect(report.baseline?.totalPoints).toBe(3)
    expect(report.scopeChange?.added).toEqual([later.id])
    expect(report.scopeChange?.removed).toEqual([])
    // Both halves come from one list of items, so they cannot disagree about
    // which items the sprint holds.
    expect(report.scopeChange?.committedPoints).toBe(3)
  })

  it('reports work taken back out, not only work that arrived', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const committed = await sized(deps, stored, 'committed', 3)
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
    const inSprint = (await deps.workItems.list(stored.project.id, {})).find(
      (one) => one.id === committed.id,
    )!
    await planSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: null,
        items: [{ workItemId: inSprint.id, expectedRevision: inSprint.revision }],
      },
    })

    const report = await readSprintReport(deps, {
      actor: actor(),
      command: { projectId: stored.project.id, sprintId: started.id },
    })

    expect(report.scopeChange?.removed).toEqual([committed.id])
    expect(report.progress.total.count).toBe(0)
  })
})
