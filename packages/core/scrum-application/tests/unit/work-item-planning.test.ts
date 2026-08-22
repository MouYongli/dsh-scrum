import { describe, expect, it } from 'vitest'
import {
  PROJECT_ROLE,
  SPRINT_STATUS,
  WORK_ITEM_STATUS,
  createSprint,
  formatSprintId,
  startSprint,
  toRevision,
  toTimestamp,
  type Sprint,
} from '@dsh-scrum/scrum-domain'
import {
  blockWorkItem,
  deleteWorkItem,
  moveWorkItemStatus,
  moveWorkItemToRank,
  planSprint,
  setWorkItemDependency,
  setWorkItemParent,
  updateWorkItem,
  type StoredProject,
} from '@dsh-scrum/scrum-application'
import {
  ACTOR_ID,
  NOW,
  OTHER_ID,
  actor,
  dependencies,
  type TestDependencies,
} from '../support/fakes.js'
import { item, memberWithRoles, project } from '../support/project.js'

async function caught(run: Promise<unknown>): Promise<{ code?: string; details?: unknown }> {
  return (await run.catch((error: unknown) => error)) as { code?: string; details?: unknown }
}

function sprint(deps: TestDependencies, stored: StoredProject, sequence = 1): Sprint {
  const planned = createSprint({
    id: formatSprintId(sequence),
    projectId: stored.project.id,
    name: `sprint ${sequence}`,
    startDate: NOW,
    endDate: toTimestamp('2026-09-05T09:00:00.000Z'),
    createdBy: ACTOR_ID,
    now: NOW,
  })
  deps.sprints.add(planned)
  return planned
}

describe('moveWorkItemToRank', () => {
  it('derives the rank from the two neighbours and writes only that item', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const first = await item(deps, stored, { title: 'first' })
    const second = await item(deps, stored, { title: 'second' })
    const third = await item(deps, stored, { title: 'third' })

    const moved = await moveWorkItemToRank(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: third.id,
        expectedRevision: third.revision,
        after: first.rank,
        before: second.rank,
      },
    })

    expect(moved.rank > first.rank && moved.rank < second.rank).toBe(true)
    expect(deps.workItems.items.get(first.id)?.revision).toBe(first.revision)
    expect(deps.workItems.items.get(second.id)?.revision).toBe(second.revision)
  })
})

describe('moveWorkItemStatus', () => {
  async function planned(deps: TestDependencies, stored: StoredProject) {
    const created = await item(deps, stored)
    const active = startSprint(sprint(deps, stored), [], NOW)
    deps.sprints.add(active)
    const [moved] = await planSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: active.id,
        items: [{ workItemId: created.id, expectedRevision: created.revision }],
      },
    })
    return moved!
  }

  it('lets an assignee move their own card', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    memberWithRoles(deps, stored, OTHER_ID, [PROJECT_ROLE.developer])
    const onBoard = await planned(deps, stored)
    const assigned = await updateWorkItem(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: onBoard.id,
        expectedRevision: onBoard.revision,
        changes: { assigneeId: OTHER_ID },
      },
    })

    const moved = await moveWorkItemStatus(deps, {
      actor: actor({ identityId: OTHER_ID }),
      command: {
        projectId: stored.project.id,
        workItemId: assigned.id,
        expectedRevision: assigned.revision,
        status: WORK_ITEM_STATUS.inProgress,
      },
    })

    expect(moved.status).toBe(WORK_ITEM_STATUS.inProgress)
  })

  // Developers hold `workItem.updateAnyStatus` by default, so the role that
  // shows the distinction is one whose configurable cell nobody turned on.
  it('refuses a product owner moving somebody else card', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    memberWithRoles(deps, stored, OTHER_ID, [PROJECT_ROLE.productOwner])
    const onBoard = await planned(deps, stored)

    const error = await caught(
      moveWorkItemStatus(deps, {
        actor: actor({ identityId: OTHER_ID }),
        command: {
          projectId: stored.project.id,
          workItemId: onBoard.id,
          expectedRevision: onBoard.revision,
          status: WORK_ITEM_STATUS.inProgress,
        },
      }),
    )

    expect(error.code).toBe('FORBIDDEN')
    expect(error.details).toMatchObject({ permission: 'workItem.updateAnyStatus' })
  })

  it('refuses a board move for an item that is in no sprint', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const created = await item(deps, stored)

    const error = await caught(
      moveWorkItemStatus(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          workItemId: created.id,
          expectedRevision: created.revision,
          status: WORK_ITEM_STATUS.inProgress,
        },
      }),
    )

    expect(error.code).toBe('VALIDATION')
  })
})

describe('blockWorkItem', () => {
  it('blocks with a reason and clears it again', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const created = await item(deps, stored)

    const blocked = await blockWorkItem(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: created.id,
        expectedRevision: created.revision,
        reason: 'waiting on the payment provider',
      },
    })
    const cleared = await blockWorkItem(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: blocked.id,
        expectedRevision: blocked.revision,
        reason: null,
      },
    })

    expect(blocked.blockedReason).toBe('waiting on the payment provider')
    expect(cleared.blockedReason).toBeNull()
    expect(deps.activity.events.map((event) => event.action)).toEqual([
      'workItem.create',
      'workItem.block',
      'workItem.unblock',
    ])
  })
})

describe('links between items', () => {
  it('refuses a parent link that would close a loop', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const parent = await item(deps, stored, { title: 'epic' })
    const child = await item(deps, stored, { title: 'story' })
    const linked = await setWorkItemParent(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: child.id,
        expectedRevision: child.revision,
        parentId: parent.id,
      },
    })

    const error = await caught(
      setWorkItemParent(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          workItemId: parent.id,
          expectedRevision: parent.revision,
          parentId: linked.id,
        },
      }),
    )

    expect(error.code).toBe('VALIDATION')
  })

  it('adds and removes a dependency', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const first = await item(deps, stored, { title: 'first' })
    const second = await item(deps, stored, { title: 'second' })

    const linked = await setWorkItemDependency(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: second.id,
        expectedRevision: second.revision,
        dependsOnId: first.id,
        linked: true,
      },
    })
    const unlinked = await setWorkItemDependency(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: linked.id,
        expectedRevision: linked.revision,
        dependsOnId: first.id,
        linked: false,
      },
    })

    expect(linked.dependsOn).toEqual([first.id])
    expect(unlinked.dependsOn).toEqual([])
  })
})

describe('deleteWorkItem', () => {
  it('refuses while something still points at the item and says what', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const parent = await item(deps, stored, { title: 'epic' })
    const child = await item(deps, stored, { title: 'story' })
    await setWorkItemParent(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: child.id,
        expectedRevision: child.revision,
        parentId: parent.id,
      },
    })

    const error = await caught(
      deleteWorkItem(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          workItemId: parent.id,
          expectedRevision: parent.revision,
        },
      }),
    )

    expect(error.code).toBe('VALIDATION')
    expect(error.details).toMatchObject({ children: [child.id], dependants: [] })
    expect(deps.workItems.items.has(parent.id)).toBe(true)
  })

  it('deletes an item nothing references', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const created = await item(deps, stored)

    const references = await deleteWorkItem(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        workItemId: created.id,
        expectedRevision: created.revision,
      },
    })

    expect(references).toEqual({ children: [], dependants: [] })
    expect(deps.workItems.items.has(created.id)).toBe(false)
  })
})

describe('planSprint', () => {
  it('moves every item into the sprint in one decision', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const first = await item(deps, stored, { title: 'first' })
    const second = await item(deps, stored, { title: 'second' })
    const target = sprint(deps, stored)

    const planned = await planSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: target.id,
        items: [
          { workItemId: first.id, expectedRevision: first.revision },
          { workItemId: second.id, expectedRevision: second.revision },
        ],
      },
    })

    expect(planned.map((moved) => moved.sprintId)).toEqual([target.id, target.id])
    expect(planned.map((moved) => moved.status)).toEqual([
      WORK_ITEM_STATUS.todo,
      WORK_ITEM_STATUS.todo,
    ])
  })

  it('moves none of them when one is out of date', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const first = await item(deps, stored, { title: 'first' })
    const second = await item(deps, stored, { title: 'second' })
    const target = sprint(deps, stored)

    const error = await caught(
      planSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          sprintId: target.id,
          items: [
            { workItemId: first.id, expectedRevision: first.revision },
            { workItemId: second.id, expectedRevision: toRevision(second.revision + 5) },
          ],
        },
      }),
    )

    expect(error.code).toBe('CONFLICT')
    expect(deps.workItems.items.get(first.id)?.sprintId).toBeNull()
    expect(deps.workItems.items.get(second.id)?.sprintId).toBeNull()
    expect(deps.activity.events.filter((event) => event.action === 'sprint.plan')).toEqual([])
  })

  it('writes nothing when a concurrent change lands between the check and the batch', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const first = await item(deps, stored, { title: 'first' })
    const second = await item(deps, stored, { title: 'second' })
    const target = sprint(deps, stored)
    // Someone else edits the second item after this planner read it, in the
    // one window a per-item write would tear the batch apart.
    deps.writes.beforeNext = () => {
      deps.workItems.items.set(second.id, { ...second, revision: toRevision(second.revision + 1) })
    }

    const error = await caught(
      planSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          sprintId: target.id,
          items: [
            { workItemId: first.id, expectedRevision: first.revision },
            { workItemId: second.id, expectedRevision: second.revision },
          ],
        },
      }),
    )

    expect(error.code).toBe('CONFLICT')
    expect(deps.workItems.items.get(first.id)?.sprintId).toBeNull()
    expect(deps.workItems.items.get(second.id)?.sprintId).toBeNull()
  })

  it('returns items to the backlog', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const created = await item(deps, stored)
    const target = sprint(deps, stored)
    const [inSprint] = await planSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: target.id,
        items: [{ workItemId: created.id, expectedRevision: created.revision }],
      },
    })

    const [returned] = await planSprint(deps, {
      actor: actor(),
      command: {
        projectId: stored.project.id,
        sprintId: null,
        items: [{ workItemId: inSprint!.id, expectedRevision: inSprint!.revision }],
      },
    })

    expect(returned!.sprintId).toBeNull()
    expect(returned!.status).toBe(WORK_ITEM_STATUS.backlog)
  })

  it('refuses to plan into a closed sprint', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const created = await item(deps, stored)
    const target = sprint(deps, stored)
    deps.sprints.add({ ...target, status: SPRINT_STATUS.closed })

    const error = await caught(
      planSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          sprintId: target.id,
          items: [{ workItemId: created.id, expectedRevision: created.revision }],
        },
      }),
    )

    expect(error.code).toBe('VALIDATION')
  })

  it('reports a sprint that is not there', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const created = await item(deps, stored)

    const error = await caught(
      planSprint(deps, {
        actor: actor(),
        command: {
          projectId: stored.project.id,
          sprintId: formatSprintId(9),
          items: [{ workItemId: created.id, expectedRevision: created.revision }],
        },
      }),
    )

    expect(error.code).toBe('NOT_FOUND')
  })
})
