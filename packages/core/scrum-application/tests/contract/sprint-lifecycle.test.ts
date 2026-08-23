import { describe, expect, it } from 'vitest'
import {
  SPRINT_STATUS,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  toProjectKey,
  toTenantId,
  toTimestamp,
} from '@dsh-scrum/scrum-domain'
import {
  closeSprint,
  createProject,
  createSprint,
  createWorkItem,
  listWorkItems,
  moveWorkItemStatus,
  planSprint,
  readSprintReport,
  startSprint,
  updateWorkItem,
} from '@dsh-scrum/scrum-application'
import { NOW, actor, dependencies } from '../support/fakes.js'

// One run through the whole loop: a project, some work, a sprint, a start, a
// day of progress, a close with a disposition for what did not land. Each use
// case has its own tests; this one exists because the loop is what a user
// actually does, and a step that only works in isolation is a step that has
// not been shown to work.

describe('the first scrum loop', () => {
  it('runs from an empty workspace to a closed sprint', async () => {
    const deps = dependencies()
    const stored = await createProject(deps, {
      actor: actor(),
      command: {
        tenantId: toTenantId('tnt_01K00000000000000000000001'),
        key: toProjectKey('SCR'),
        name: 'shop-service',
      },
    })
    const projectId = stored.project.id
    deps.members.add(deps.projects.owners.get(projectId)!)

    const titles = ['use a coupon', 'show the discount', 'refund a coupon']
    const created = []
    for (const title of titles) {
      created.push(
        await createWorkItem(deps, {
          actor: actor(),
          command: { projectId, type: WORK_ITEM_TYPE.story, title },
        }),
      )
    }
    expect(created.map((made) => made.id)).toEqual(['SCR-1', 'SCR-2', 'SCR-3'])

    const estimated = []
    for (const made of created) {
      estimated.push(
        await updateWorkItem(deps, {
          actor: actor(),
          command: {
            projectId,
            workItemId: made.id,
            expectedRevision: made.revision,
            changes: { estimate: 3 },
          },
        }),
      )
    }

    const sprint = await createSprint(deps, {
      actor: actor(),
      command: {
        projectId,
        name: 'sprint one',
        goal: 'coupons work end to end',
        startDate: NOW,
        endDate: toTimestamp('2026-09-05T09:00:00.000Z'),
      },
    })

    // The last story stays in the backlog, so the close has something to keep
    // out of it as well as something to dispose of.
    const planned = await planSprint(deps, {
      actor: actor(),
      command: {
        projectId,
        sprintId: sprint.id,
        items: estimated
          .slice(0, 2)
          .map((made) => ({ workItemId: made.id, expectedRevision: made.revision })),
      },
    })
    const active = await startSprint(deps, {
      actor: actor(),
      command: { projectId, sprintId: sprint.id, expectedRevision: sprint.revision },
    })
    expect(active.status).toBe(SPRINT_STATUS.active)
    expect(active.startedAt).toBe(NOW)

    let advanced = planned[0]!
    for (const status of [
      WORK_ITEM_STATUS.inProgress,
      WORK_ITEM_STATUS.review,
      WORK_ITEM_STATUS.done,
    ]) {
      advanced = await moveWorkItemStatus(deps, {
        actor: actor(),
        command: {
          projectId,
          workItemId: advanced.id,
          expectedRevision: advanced.revision,
          status,
        },
      })
    }

    const midway = (
      await readSprintReport(deps, {
        actor: actor(),
        command: { projectId, sprintId: sprint.id },
      })
    ).progress
    expect(midway.total).toEqual({ count: 2, estimate: 6 })
    expect(midway.finished).toEqual({ count: 1, estimate: 3 })
    expect(midway.unestimated).toBe(0)

    const unfinished = planned[1]!
    const closed = await closeSprint(deps, {
      actor: actor(),
      command: {
        projectId,
        sprintId: sprint.id,
        expectedRevision: active.revision,
        resultSummary: 'one story landed',
        dispositions: [
          {
            workItemId: unfinished.id,
            expectedRevision: deps.workItems.items.get(unfinished.id)!.revision,
            moveTo: null,
          },
        ],
      },
    })

    expect(closed.status).toBe(SPRINT_STATUS.closed)
    expect(closed.closedAt).toBe(NOW)
    // The delivered story keeps the sprint that delivered it; the other one is
    // back in the backlog, and the story never planned never moved.
    expect(deps.workItems.items.get(advanced.id)?.sprintId).toBe(sprint.id)
    expect(deps.workItems.items.get(unfinished.id)?.sprintId).toBeNull()
    expect(deps.workItems.items.get(created[2]!.id)?.status).toBe(WORK_ITEM_STATUS.backlog)

    const backlog = await listWorkItems(deps, {
      actor: actor(),
      command: { projectId, filter: { sprintId: null } },
    })
    expect(backlog.map((found) => found.id)).toEqual([unfinished.id, created[2]!.id])

    const after = (
      await readSprintReport(deps, {
        actor: actor(),
        command: { projectId, sprintId: sprint.id },
      })
    ).progress
    expect(after.total).toEqual({ count: 1, estimate: 3 })
    expect(after.finished).toEqual({ count: 1, estimate: 3 })

    expect(deps.activity.events.map((event) => event.action)).toEqual([
      'project.create',
      'workItem.create',
      'workItem.create',
      'workItem.create',
      'workItem.update',
      'workItem.update',
      'workItem.update',
      'sprint.create',
      'sprint.plan',
      'sprint.plan',
      'sprint.start',
      'workItem.status',
      'workItem.status',
      'workItem.status',
      'sprint.close',
      'sprint.remove',
    ])
  })
})
