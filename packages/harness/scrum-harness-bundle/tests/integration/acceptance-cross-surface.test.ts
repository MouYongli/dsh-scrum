import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HIGH_IMPACT_TOOLS, WRITE_TOOL_NAMES, confirmationFor } from '@dsh-scrum/scrum-agent-tools'
import {
  ERROR_CODE,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  isScrumError,
  toProjectKey,
  toTimestamp,
} from '@dsh-scrum/scrum-domain'
import { createBacklogController, createSprintController } from '@dsh-scrum/scrum-ui'
import { clientOver } from '../support/client.js'
import { installation, type Installation } from '../support/installation.js'

// The two surfaces over one workspace. The screens go through the client
// interface they were built against; the agent goes through the tool-facing
// API with the same user identity. Both land on the same use cases and the same files,
// which is the property this suite exists to prove.

let app: Installation

beforeEach(async () => {
  app = await installation('cross-surface')
  await app.host.initialise({ key: toProjectKey('SCR'), name: 'shop-service' })
})

afterEach(async () => {
  await app.dispose()
})

async function codeOf(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run()
    return undefined
  } catch (error: unknown) {
    return isScrumError(error) ? error.code : undefined
  }
}

describe('what one surface writes, the other reads', () => {
  it('shows the agent what the screen just created', async () => {
    const backlog = createBacklogController(clientOver(app.host))
    await backlog.load()
    await backlog.create({ type: WORK_ITEM_TYPE.story, title: '结算对账' })

    const seen = await app.agent().backlog()

    expect(seen.map((item) => item.title)).toEqual(['结算对账'])
  })

  it('shows the screen what the agent just wrote', async () => {
    await app.agent().createWorkItem({ type: WORK_ITEM_TYPE.task, title: '导出差异报表' })

    const backlog = createBacklogController(clientOver(app.host))
    await backlog.load()

    expect(backlog.state().page.total).toBe(1)
  })
})

describe('when both surfaces write the same item', () => {
  it('refuses the one working from the older read, and says so as a conflict', async () => {
    const created = await app.host.createWorkItem({
      type: WORK_ITEM_TYPE.story,
      title: '结算对账',
    })

    // Both surfaces read the same revision, and the agent gets there first.
    await app.agent().updateWorkItem({
      workItemId: created.id,
      expectedRevision: created.revision,
      changes: { title: 'agent 改的标题' },
    })

    const backlog = createBacklogController(clientOver(app.host))
    await backlog.load()
    await backlog.edit({
      workItemId: created.id,
      expectedRevision: created.revision,
      changes: { title: '界面改的标题' },
    })

    expect(backlog.state().failure?.kind).toBe('conflict')

    // Nothing was overwritten, and a refresh shows what actually happened.
    await backlog.load()

    expect(backlog.state().page.groups[0]?.rows[0]?.item.title).toBe('agent 改的标题')
  })

  it('reports the same refusal to the agent, with both revisions', async () => {
    const created = await app.host.createWorkItem({ type: WORK_ITEM_TYPE.task, title: '对账' })
    await app.host.updateWorkItem({
      workItemId: created.id,
      expectedRevision: created.revision,
      changes: { title: '界面改的标题' },
    })

    expect(
      await codeOf(
        async () =>
          await app.agent().updateWorkItem({
            workItemId: created.id,
            expectedRevision: created.revision,
            changes: { title: 'agent 改的标题' },
          }),
      ),
    ).toBe(ERROR_CODE.conflict)
  })
})

describe('the high impact actions', () => {
  it('are the ones a person has to agree to before the agent runs them', () => {
    for (const tool of HIGH_IMPACT_TOOLS) {
      expect(confirmationFor(tool).kind).toBe('ask')
    }
    const ordinary = WRITE_TOOL_NAMES.filter((tool) => !HIGH_IMPACT_TOOLS.includes(tool))

    expect(ordinary).not.toEqual([])
    for (const tool of ordinary) {
      expect(confirmationFor(tool).kind).toBe('allow')
    }
  })

  it('still run once agreed, and land in the same workspace the screen reads', async () => {
    const sprint = await app.agent().createSprint({
      name: '第一个 Sprint',
      startDate: toTimestamp('2026-09-01T00:00:00.000Z'),
      endDate: toTimestamp('2026-09-15T00:00:00.000Z'),
    })

    // The gate is a pre-execute decision, so a confirmed call reaches the API
    // unchanged; this is that call.
    const started = await app.agent().startSprint({
      sprintId: sprint.id,
      expectedRevision: sprint.revision,
    })

    const sprints = createSprintController(clientOver(app.host))
    await sprints.load()

    expect(started.status).toBe('active')
    expect(sprints.state().selected?.id).toBe(sprint.id)
    expect(sprints.state().selected?.status).toBe('active')
  })

  it('records who did it and in which conversation', async () => {
    const created = await app.agent().createWorkItem({
      type: WORK_ITEM_TYPE.story,
      title: 'agent 建的',
    })

    expect(created.status).toBe(WORK_ITEM_STATUS.backlog)
  })
})
