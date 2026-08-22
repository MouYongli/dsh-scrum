import { readdir } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  workspaceLayout,
  type WorkspaceRepositories,
} from '@dsh-scrum/adapter-storage-workspace-files'
import {
  ERROR_CODE,
  WORK_ITEM_STATUS,
  assignWorkItemToSprint,
  moveWorkItemStatus,
  toProjectId,
  toRevision,
  toSprintId,
  toWorkItemId,
  updateWorkItemDetails,
} from '@dsh-scrum/scrum-domain'
import {
  OTHER_ULID,
  T2,
  codeOf,
  initialisedWorkspace,
  item,
  project,
  removeWorkspace,
  sprintOf,
} from '../support/workspace.js'

let root: string
let repositories: WorkspaceRepositories

beforeEach(async () => {
  ;({ root, repositories } = await initialisedWorkspace('entity-repository'))
})

afterEach(async () => {
  await removeWorkspace(root)
})

describe('work items', () => {
  it('creates, reads back and refuses a second create of the same identifier', async () => {
    await repositories.workItems.create(item('SCR-1'))

    expect((await repositories.workItems.find(project.id, toWorkItemId('SCR-1')))?.title).toBe(
      'SCR-1',
    )
    expect(await codeOf(async () => await repositories.workItems.create(item('SCR-1')))).toBe(
      ERROR_CODE.conflict,
    )
  })

  it('issues the number after the highest one, leaving gaps where they fell', async () => {
    await repositories.workItems.create(item('SCR-1'))
    await repositories.workItems.create(item('SCR-7'))

    expect(await repositories.workItems.nextIdentifier(project.id)).toBe(toWorkItemId('SCR-8'))

    await repositories.workItems.remove(project.id, toWorkItemId('SCR-1'), toRevision(1))

    expect(await repositories.workItems.nextIdentifier(project.id)).toBe(toWorkItemId('SCR-8'))
  })

  it('issues a deleted newest number again, which is an open question', async () => {
    await repositories.workItems.create(item('SCR-1'))
    await repositories.workItems.remove(project.id, toWorkItemId('SCR-1'), toRevision(1))

    // Scanning cannot know a number was once used. Pinned here so that giving
    // the store a high-water mark is a deliberate change and not a surprise.
    expect(await repositories.workItems.nextIdentifier(project.id)).toBe(toWorkItemId('SCR-1'))
  })

  it('applies the filter the application defines, in backlog order', async () => {
    await repositories.workItems.create(item('SCR-1'))
    const second = item('SCR-2')
    await repositories.workItems.create(second)
    await repositories.workItems.save(
      updateWorkItemDetails(second, { title: '结算对账' }, T2),
      toRevision(1),
    )

    expect(
      (await repositories.workItems.list(project.id, { text: '结算' })).map((entry) => entry.id),
    ).toEqual([toWorkItemId('SCR-2')])
  })

  it('refuses a save and a removal that worked from a stale read', async () => {
    const created = item('SCR-1')
    await repositories.workItems.create(created)
    await repositories.workItems.save(
      updateWorkItemDetails(created, { title: 'first' }, T2),
      toRevision(1),
    )

    expect(
      await codeOf(
        async () =>
          await repositories.workItems.save(
            updateWorkItemDetails(created, { title: 'second' }, T2),
            toRevision(1),
          ),
      ),
    ).toBe(ERROR_CODE.conflict)
    expect(
      await codeOf(
        async () =>
          await repositories.workItems.remove(project.id, toWorkItemId('SCR-1'), toRevision(1)),
      ),
    ).toBe(ERROR_CODE.conflict)
  })

  it('reports a work item from another project as absent', async () => {
    await repositories.workItems.create(item('SCR-1'))

    expect(
      await repositories.workItems.find(toProjectId(`prj_${OTHER_ULID}`), toWorkItemId('SCR-1')),
    ).toBeNull()
  })

  it('keeps the status a caller moved it to', async () => {
    const created = item('SCR-1')
    await repositories.workItems.create(created)
    const planned = assignWorkItemToSprint(created, toSprintId('sprint-1'), T2)
    await repositories.workItems.save(planned, toRevision(1))

    await repositories.workItems.save(
      moveWorkItemStatus(planned, WORK_ITEM_STATUS.inProgress, T2),
      toRevision(2),
    )

    expect((await repositories.workItems.find(project.id, toWorkItemId('SCR-1')))?.status).toBe(
      WORK_ITEM_STATUS.inProgress,
    )
  })
})

describe('sprints', () => {
  it('creates, lists and numbers the next one after the highest', async () => {
    await repositories.sprints.create(sprintOf('sprint-1'))
    await repositories.sprints.create(sprintOf('sprint-4'))

    expect(await repositories.sprints.list(project.id)).toHaveLength(2)
    expect(await repositories.sprints.nextIdentifier(project.id)).toBe(toSprintId('sprint-5'))
  })

  it('reports a sprint from another project as absent', async () => {
    await repositories.sprints.create(sprintOf('sprint-1'))

    expect(
      await repositories.sprints.find(toProjectId(`prj_${OTHER_ULID}`), toSprintId('sprint-1')),
    ).toBeNull()
  })
})

describe('a write that spans two entities', () => {
  it('lands together and leaves no journal behind', async () => {
    const sprint = sprintOf('sprint-1')
    await repositories.sprints.create(sprint)
    const created = item('SCR-1')
    await repositories.workItems.create(created)

    await repositories.transactions.apply('sprint.plan', {
      workItems: [
        { item: assignWorkItemToSprint(created, sprint.id, T2), expected: toRevision(1) },
      ],
      sprints: [
        { sprint: { ...sprint, revision: toRevision(2), updatedAt: T2 }, expected: toRevision(1) },
      ],
    })

    expect((await repositories.workItems.find(project.id, toWorkItemId('SCR-1')))?.sprintId).toBe(
      toSprintId('sprint-1'),
    )
    expect(await readdir(workspaceLayout(root).pendingOperations)).toEqual([])
  })

  it('writes nothing at all when one revision is stale', async () => {
    const created = item('SCR-1')
    await repositories.workItems.create(created)
    const other = item('SCR-2')
    await repositories.workItems.create(other)

    expect(
      await codeOf(
        async () =>
          await repositories.transactions.apply('sprint.close', {
            workItems: [
              { item: updateWorkItemDetails(created, { title: 'a' }, T2), expected: toRevision(1) },
              { item: updateWorkItemDetails(other, { title: 'b' }, T2), expected: toRevision(9) },
            ],
          }),
      ),
    ).toBe(ERROR_CODE.conflict)
    expect((await repositories.workItems.find(project.id, toWorkItemId('SCR-1')))?.title).toBe(
      'SCR-1',
    )
  })
})
