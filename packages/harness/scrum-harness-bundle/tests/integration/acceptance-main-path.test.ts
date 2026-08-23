import { readdir } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  activityMonth,
  readActivity,
  workspaceLayout,
} from '@dsh-scrum/adapter-storage-workspace-files'
import {
  SPRINT_STATUS,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  toProjectKey,
  toTimestamp,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'
import { installation, type Installation } from '../support/installation.js'

// The Community MVP's main path, end to end over a real workspace directory:
// create a project, put work in it, plan a sprint, start it, advance an item,
// and close it with the leftovers placed. Every step goes through the host API
// the client and the agent both call, so what is asserted here is what a user
// would get.

let app: Installation

beforeEach(async () => {
  app = await installation('main-path')
})

afterEach(async () => {
  await app.dispose()
})

const START = toTimestamp('2026-09-01T00:00:00.000Z')
const END = toTimestamp('2026-09-15T00:00:00.000Z')

async function items(): Promise<readonly WorkItem[]> {
  return await app.host.backlog()
}

describe('from an empty workspace to a closed sprint', () => {
  it('carries the whole loop and leaves the state each step promised', async () => {
    expect((await app.host.entry()).state).toBe('unbound')

    const project = await app.host.initialise({
      key: toProjectKey('SCR'),
      name: 'shop-service',
      description: '结算与对账',
    })

    expect(project.project.key).toBe('SCR')
    expect((await app.host.entry()).state).toBe('bound')

    const first = await app.host.createWorkItem({
      type: WORK_ITEM_TYPE.story,
      title: '结算对账',
    })
    const second = await app.host.createWorkItem({
      type: WORK_ITEM_TYPE.task,
      title: '导出差异报表',
    })

    expect([first.id, second.id]).toEqual(['SCR-1', 'SCR-2'])
    expect(first.status).toBe(WORK_ITEM_STATUS.backlog)

    const sprint = await app.host.createSprint({
      name: '第一个 Sprint',
      goal: '打通结算',
      startDate: START,
      endDate: END,
    })

    expect(sprint.status).toBe(SPRINT_STATUS.planned)

    const planned = await app.host.planSprint({
      sprintId: sprint.id,
      items: [
        { workItemId: first.id, expectedRevision: first.revision },
        { workItemId: second.id, expectedRevision: second.revision },
      ],
    })

    expect(planned.map((item) => item.status)).toEqual([
      WORK_ITEM_STATUS.todo,
      WORK_ITEM_STATUS.todo,
    ])

    const started = await app.host.startSprint({
      sprintId: sprint.id,
      expectedRevision: sprint.revision,
    })

    expect(started.status).toBe(SPRINT_STATUS.active)
    expect(started.startedAt).not.toBeNull()

    const inProgress = await app.host.moveWorkItemStatus({
      workItemId: first.id,
      expectedRevision: planned[0]!.revision,
      status: WORK_ITEM_STATUS.inProgress,
    })
    const done = await app.host.moveWorkItemStatus({
      workItemId: first.id,
      expectedRevision: inProgress.revision,
      status: WORK_ITEM_STATUS.done,
    })

    expect(done.status).toBe(WORK_ITEM_STATUS.done)

    const report = await app.host.report(sprint.id)

    expect(report.progress.total.count).toBe(2)
    expect(report.progress.finished.count).toBe(1)
    // The sprint is running, so it committed to something: the baseline was
    // written when it opened and the scope has not moved since.
    expect(report.baseline?.itemIds).toHaveLength(2)
    expect(report.scopeChange?.added).toEqual([])
    expect(report.scopeChange?.removed).toEqual([])

    const unfinished = (await items()).find((item) => item.id === second.id)!
    const closed = await app.host.closeSprint({
      sprintId: sprint.id,
      expectedRevision: started.revision,
      resultSummary: '第一轮跑通',
      dispositions: [
        { workItemId: unfinished.id, expectedRevision: unfinished.revision, moveTo: null },
      ],
    })

    expect(closed.status).toBe(SPRINT_STATUS.closed)
    expect(closed.resultSummary).toBe('第一轮跑通')

    const after = await items()

    // What was finished stays in the sprint; what was not went back to the
    // backlog, which is where the next planning session will find it.
    expect(after.find((item) => item.id === first.id)?.sprintId).toBe(sprint.id)
    expect(after.find((item) => item.id === second.id)?.sprintId).toBeNull()
    expect(after.find((item) => item.id === second.id)?.status).toBe(WORK_ITEM_STATUS.backlog)
  })

  it('leaves a history of every step, in the workspace the work is in', async () => {
    await app.host.initialise({ key: toProjectKey('SCR'), name: 'shop-service' })
    const created = await app.host.createWorkItem({
      type: WORK_ITEM_TYPE.story,
      title: '结算对账',
    })

    const layout = workspaceLayout(app.root)
    const months = await readdir(layout.activities)
    const { records, problems } = await readActivity(
      layout,
      activityMonth(toTimestamp(new Date().toISOString())),
    )

    expect(months).not.toEqual([])
    expect(problems).toEqual([])
    expect(records.map((record) => record.action)).toEqual(
      expect.arrayContaining(['project.create', 'workItem.create']),
    )
    expect(records.some((record) => record.targetId === created.id)).toBe(true)
  })

  it('reads that history back through the same API the screens call', async () => {
    await app.host.initialise({ key: toProjectKey('SCR'), name: 'shop-service' })
    const created = await app.host.createWorkItem({
      type: WORK_ITEM_TYPE.story,
      title: '结算对账',
    })

    const history = await app.host.activity({ limit: 10 })

    // Newest first, so the panel that shows three lines shows the last three
    // things that happened rather than the first three ever recorded.
    expect(history.problems).toEqual([])
    expect(history.events[0]?.action).toBe('workItem.create')
    expect(history.events[0]?.targetId).toBe(created.id)
    expect(history.events.map((event) => event.action)).toContain('project.create')
  })

  it('keeps everything inside .scrum, and nothing anywhere else', async () => {
    await app.host.initialise({ key: toProjectKey('SCR'), name: 'shop-service' })
    await app.host.createWorkItem({ type: WORK_ITEM_TYPE.bug, title: '对账差异' })

    expect(await readdir(app.root)).toEqual(['.scrum'])
  })
})
