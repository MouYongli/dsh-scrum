import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SPRINT_STATUS, WORK_ITEM_STATUS, WORK_ITEM_TYPE } from '@dsh-scrum/scrum-domain'
import {
  READ_TOOL,
  WRITE_TOOL,
  createReadTools,
  createWriteTools,
  registerScrumConfirmation,
} from '@dsh-scrum/scrum-agent-tools'
import { boundHost, store, type Store } from '../support/host.js'

const RUN = {} as never

type Api = Parameters<typeof createWriteTools>[0]

async function call(api: Api, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const tool = [...createReadTools(api), ...createWriteTools(api)].find(
    (definition) => definition.name === name,
  ) as { execute(args: unknown, exec: never): Promise<unknown> }
  return await tool.execute(args, RUN)
}

function value(outcome: unknown): Record<string, unknown> {
  return (outcome as { ok: true; result: Record<string, unknown> }).result
}

async function writing(state: Store): Promise<Api> {
  return (await boundHost(state)).api
}

// One agent working a sprint end to end through the tools, because the loop is
// what an agent actually does and a tool that only works in isolation has not
// been shown to work.

describe('an agent running a sprint through the tools', () => {
  it('creates, plans, starts, advances and closes', async () => {
    const state = store()
    const api = await writing(state)

    const first = value(
      await call(api, WRITE_TOOL.createWorkItem, {
        type: WORK_ITEM_TYPE.story,
        title: 'use a coupon',
      }),
    )
    const second = value(
      await call(api, WRITE_TOOL.createWorkItem, {
        type: WORK_ITEM_TYPE.story,
        title: 'show the discount',
      }),
    )
    const sprint = value(
      await call(api, WRITE_TOOL.createSprint, {
        name: 'sprint one',
        goal: 'coupons work',
        startDate: '2026-08-22T09:00:00.000Z',
        endDate: '2026-09-05T09:00:00.000Z',
      }),
    )
    expect(sprint['status']).toBe(SPRINT_STATUS.planned)

    const plannedFirst = value(
      await call(api, WRITE_TOOL.moveWorkItem, {
        workItemId: first['id'],
        expectedRevision: first['revision'],
        sprintId: sprint['id'],
      }),
    )
    await call(api, WRITE_TOOL.moveWorkItem, {
      workItemId: second['id'],
      expectedRevision: second['revision'],
      sprintId: sprint['id'],
    })
    expect(plannedFirst['status']).toBe(WORK_ITEM_STATUS.todo)

    const started = value(
      await call(api, WRITE_TOOL.startSprint, {
        sprintId: sprint['id'],
        expectedRevision: sprint['revision'],
      }),
    )
    expect(started['status']).toBe(SPRINT_STATUS.active)

    let advanced = plannedFirst
    for (const status of [
      WORK_ITEM_STATUS.inProgress,
      WORK_ITEM_STATUS.review,
      WORK_ITEM_STATUS.done,
    ]) {
      advanced = value(
        await call(api, WRITE_TOOL.moveWorkItem, {
          workItemId: advanced['id'],
          expectedRevision: advanced['revision'],
          status,
        }),
      )
    }
    expect(advanced['status']).toBe(WORK_ITEM_STATUS.done)

    const progress = (await call(api, READ_TOOL.getSprint, { sprintId: sprint['id'] })) as {
      progress: { finished: { count: number } }
    }
    expect(progress.progress.finished.count).toBe(1)

    const unfinished = state.workItems.get(second['id'] as never)!
    const closed = value(
      await call(api, WRITE_TOOL.closeSprint, {
        sprintId: sprint['id'],
        expectedRevision: started['revision'],
        resultSummary: 'one story landed',
        dispositions: [
          {
            workItemId: unfinished.id,
            expectedRevision: unfinished.revision,
            moveTo: 'backlog',
          },
        ],
      }),
    )

    expect(closed['status']).toBe(SPRINT_STATUS.closed)
    expect(state.workItems.get(second['id'] as never)?.sprintId).toBeNull()
    expect(state.activity.map((event) => event.action)).toContain('sprint.close')
    expect(state.activity.every((event) => event.source === 'ui')).toBe(true)
  })

  it('reorders the backlog and changes the project settings', async () => {
    const state = store()
    const api = await writing(state)
    const first = value(
      await call(api, WRITE_TOOL.createWorkItem, { type: WORK_ITEM_TYPE.task, title: 'first' }),
    )
    const second = value(
      await call(api, WRITE_TOOL.createWorkItem, { type: WORK_ITEM_TYPE.task, title: 'second' }),
    )
    const stored = state.workItems.get(first['id'] as never)!

    const moved = value(
      await call(api, WRITE_TOOL.moveWorkItem, {
        workItemId: second['id'],
        expectedRevision: second['revision'],
        beforeRank: stored.rank,
      }),
    )
    const settings = value(
      await call(api, WRITE_TOOL.changeProjectSettings, {
        expectedRevision: 1,
        sprintLengthInDays: 3,
        estimationMethod: 'hours',
        definitionOfDone: ['reviewed'],
      }),
    )

    expect(String(moved['id'])).toBe(second['id'])
    expect(settings).toMatchObject({
      sprintLengthInDays: 3,
      estimationMethod: 'hours',
      definitionOfDone: ['reviewed'],
    })
  })

  it('deletes an item nothing points at', async () => {
    const state = store()
    const api = await writing(state)
    const item = value(
      await call(api, WRITE_TOOL.createWorkItem, { type: WORK_ITEM_TYPE.task, title: 'spike' }),
    )

    const removed = value(
      await call(api, WRITE_TOOL.deleteWorkItem, {
        workItemId: item['id'],
        expectedRevision: item['revision'],
      }),
    )

    expect(removed).toEqual({ children: [], dependants: [] })
    expect(state.workItems.size).toBe(0)
  })
})

describe('the confirmation gate in a real context', () => {
  it('asks before a high impact call and lets an ordinary one through', async () => {
    const ctx = new Context()
    registerScrumConfirmation(ctx)

    const asked = await ctx.waterfall(
      'tools/pre-execute',
      { name: WRITE_TOOL.deleteWorkItem } as never,
      async () => ({ kind: 'allow' }),
    )
    const allowed = await ctx.waterfall(
      'tools/pre-execute',
      { name: WRITE_TOOL.updateWorkItem } as never,
      async () => ({ kind: 'allow' }),
    )

    expect((asked as { kind: string }).kind).toBe('ask')
    expect((allowed as { kind: string }).kind).toBe('allow')
  })
})
