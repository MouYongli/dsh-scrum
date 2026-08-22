import { describe, expect, it } from 'vitest'
import { PROJECT_ROLE, WORK_ITEM_TYPE } from '@dsh-scrum/scrum-domain'
import { ACTIVITY_SOURCE, createWorkItem, updateWorkItem } from '@dsh-scrum/scrum-application'
import { OTHER_ID, actor, dependencies, type TestDependencies } from '../support/fakes.js'
import { item, memberWithRoles, project } from '../support/project.js'

// The UI and the agent are two callers of one service. Nothing in a use case
// branches on where a request came from, so the source can only change what is
// recorded — never what is allowed or what happens. A second enforcement path
// is how the two drift until one of them is the way round a rule.

async function caught(run: Promise<unknown>): Promise<{ code?: string }> {
  return (await run.catch((error: unknown) => error)) as { code?: string }
}

async function create(deps: TestDependencies, source: 'ui' | 'agent', title: string) {
  const stored = await project(deps)
  return {
    stored,
    created: await createWorkItem(deps, {
      actor: actor({ source, sessionId: source === 'agent' ? 'session_1' : null }),
      command: { projectId: stored.project.id, type: WORK_ITEM_TYPE.story, title },
    }),
  }
}

describe('the ui and the agent reach one service', () => {
  it('produces the same entity from either source', async () => {
    const fromUi = dependencies()
    const fromAgent = dependencies()

    const ui = await create(fromUi, ACTIVITY_SOURCE.ui, 'use a coupon')
    const agent = await create(fromAgent, ACTIVITY_SOURCE.agent, 'use a coupon')

    const { id: uiId, ...uiRest } = ui.created
    const { id: agentId, ...agentRest } = agent.created
    expect(uiId).toBe(agentId)
    expect(uiRest).toEqual(agentRest)
  })

  it('records where the change came from, and the session for an agent', async () => {
    const fromUi = dependencies()
    const fromAgent = dependencies()

    await create(fromUi, ACTIVITY_SOURCE.ui, 'use a coupon')
    await create(fromAgent, ACTIVITY_SOURCE.agent, 'use a coupon')

    expect(fromUi.activity.events).toMatchObject([{ source: 'ui', sessionId: null }])
    expect(fromAgent.activity.events).toMatchObject([{ source: 'agent', sessionId: 'session_1' }])
  })

  it('refuses the same actor identically whichever door it came through', async () => {
    const deps = dependencies()
    const stored = await project(deps)
    const created = await item(deps, stored)
    memberWithRoles(deps, stored, OTHER_ID, [PROJECT_ROLE.stakeholder])
    const command = {
      projectId: stored.project.id,
      workItemId: created.id,
      expectedRevision: created.revision,
      changes: { title: 'renamed' },
    }

    const viaUi = await caught(
      updateWorkItem(deps, {
        actor: actor({ identityId: OTHER_ID, source: ACTIVITY_SOURCE.ui }),
        command,
      }),
    )
    const viaAgent = await caught(
      updateWorkItem(deps, {
        actor: actor({
          identityId: OTHER_ID,
          source: ACTIVITY_SOURCE.agent,
          sessionId: 'session_1',
        }),
        command,
      }),
    )

    expect(viaUi.code).toBe('FORBIDDEN')
    expect(viaAgent.code).toBe('FORBIDDEN')
    expect(deps.workItems.items.get(created.id)?.title).toBe('use a coupon')
  })
})
