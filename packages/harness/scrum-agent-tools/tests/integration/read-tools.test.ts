import { describe, expect, it } from 'vitest'
import {
  WORK_ITEM_TYPE,
  createSprint,
  createWorkItem,
  formatSprintId,
  formatWorkItemId,
  toProjectKey,
  toRank,
  type ProjectId,
} from '@dsh-scrum/scrum-domain'
import { ACCESS_MODE } from '@dsh-scrum/scrum-application'
import {
  MAX_LIMIT,
  READ_TOOL,
  READ_TOOL_NAMES,
  createReadTools,
  registerScrumTools,
  visibleTools,
} from '@dsh-scrum/scrum-agent-tools'
import { IDENTITY, NOW, boundHost, store, type Store } from '../support/host.js'

const RUN = {} as never

function toolsOf(api: Parameters<typeof createReadTools>[0]): Map<string, unknown> {
  return new Map(createReadTools(api).map((tool) => [tool.name, tool]))
}

async function call(
  api: Parameters<typeof createReadTools>[0],
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const tool = toolsOf(api).get(name) as { execute(args: unknown, exec: never): Promise<unknown> }
  return await tool.execute(args, RUN)
}

/** Ranks are plain increasing strings; a trailing zero is not a valid rank. */
function rankFor(index: number): string {
  return `a${'a'.repeat(index)}`
}

function seedItems(state: Store, projectId: ProjectId, count: number): void {
  for (let index = 1; index <= count; index += 1) {
    const item = createWorkItem({
      id: formatWorkItemId(toProjectKey('SCR'), index),
      projectId,
      type: WORK_ITEM_TYPE.story,
      title: `story ${index}`,
      reporterId: IDENTITY,
      rank: toRank(rankFor(index)),
      now: NOW,
    })
    state.workItems.set(item.id, item)
  }
}

describe('tool visibility', () => {
  it('shows an off session nothing at all', () => {
    expect(visibleTools(ACCESS_MODE.off)).toEqual([])
  })

  it('shows a read session every read tool', () => {
    expect([...visibleTools(ACCESS_MODE.read)]).toEqual([...READ_TOOL_NAMES])
  })

  it('registers nothing for an off session and everything for a read one', async () => {
    const state = store()
    const { api } = await boundHost(state, ACCESS_MODE.off)

    const registered: string[] = []
    const registry = {
      register: (definition: { name: string }) => {
        registered.push(definition.name)
        return () => {
          registered.splice(registered.indexOf(definition.name), 1)
        }
      },
    }

    const off = registerScrumTools(registry, api, ACCESS_MODE.off)
    expect(off.names).toEqual([])
    expect(registered).toEqual([])

    const reading = registerScrumTools(registry, api, ACCESS_MODE.read)
    expect(registered).toHaveLength(READ_TOOL_NAMES.length)

    reading.dispose()
    expect(registered).toEqual([])
  })
})

describe('the read tools', () => {
  it('refuse every call from an off session', async () => {
    const state = store()
    const { api } = await boundHost(state, ACCESS_MODE.off)

    const error = await call(api, READ_TOOL.getProject).catch((caught: unknown) => caught)

    expect((error as { code?: string }).code).toBe('FORBIDDEN')
  })

  it('read the project a read session is allowed to see', async () => {
    const state = store()
    const { api } = await boundHost(state)

    const project = (await call(api, READ_TOOL.getProject)) as Record<string, unknown>

    expect(project['key']).toBe('SCR')
    expect(project['name']).toBe('shop-service')
    // Nothing about where the workspace lives reaches the conversation.
    expect(JSON.stringify(project)).not.toContain('/home/me')
  })

  it('bound the backlog and say how much was left behind', async () => {
    const state = store()
    const { api, projectId } = await boundHost(state)
    seedItems(state, projectId, 30)

    const listed = (await call(api, READ_TOOL.listBacklog, { limit: 5 })) as {
      items: unknown[]
      total: number
      truncated: boolean
    }

    expect(listed.items).toHaveLength(5)
    expect(listed.total).toBe(30)
    expect(listed.truncated).toBe(true)
  })

  it('refuse a limit above the cap rather than honouring it', async () => {
    const state = store()
    const { api } = await boundHost(state)

    const error = await call(api, READ_TOOL.listBacklog, { limit: MAX_LIMIT + 1 }).catch(
      (caught: unknown) => caught,
    )

    expect((error as { code?: string }).code).toBe('VALIDATION')
  })

  it('describe the backlog as the items in no sprint', async () => {
    const state = store()
    const { api, projectId } = await boundHost(state)
    seedItems(state, projectId, 3)

    const listed = (await call(api, READ_TOOL.listBacklog, { sprintId: 'backlog' })) as {
      total: number
    }

    expect(listed.total).toBe(3)
  })

  it('narrow the listing by status', async () => {
    const state = store()
    const { api, projectId } = await boundHost(state)
    seedItems(state, projectId, 3)

    const backlog = (await call(api, READ_TOOL.listBacklog, { status: 'backlog' })) as {
      total: number
    }
    const doing = (await call(api, READ_TOOL.listBacklog, { status: 'in_progress' })) as {
      total: number
    }

    expect(backlog.total).toBe(3)
    expect(doing.total).toBe(0)
  })

  it('refuse a status the workflow does not have', async () => {
    const state = store()
    const { api } = await boundHost(state)

    const error = await call(api, READ_TOOL.listBacklog, { status: 'shipped' }).catch(
      (caught: unknown) => caught,
    )

    expect((error as { code?: string }).code).toBe('VALIDATION')
  })

  it('narrow the listing to one sprint', async () => {
    const state = store()
    const { api, projectId } = await boundHost(state)
    seedItems(state, projectId, 2)
    const planned = [...state.workItems.values()][0]!
    state.workItems.set(planned.id, { ...planned, sprintId: formatSprintId(1) })

    const inSprint = (await call(api, READ_TOOL.listBacklog, { sprintId: 'sprint-1' })) as {
      total: number
    }

    expect(inSprint.total).toBe(1)
  })

  it('read one work item in full', async () => {
    const state = store()
    const { api, projectId } = await boundHost(state)
    seedItems(state, projectId, 1)

    const item = (await call(api, READ_TOOL.getWorkItem, { workItemId: 'SCR-1' })) as Record<
      string,
      unknown
    >

    expect(item['title']).toBe('story 1')
    expect(item['acceptanceCriteria']).toEqual([])
  })

  it('list the sprints and read one with its progress', async () => {
    const state = store()
    const { api, projectId } = await boundHost(state)
    const sprint = createSprint({
      id: formatSprintId(1),
      projectId,
      name: 'sprint one',
      startDate: NOW,
      endDate: '2026-09-05T09:00:00.000Z' as typeof NOW,
      createdBy: IDENTITY,
      now: NOW,
    })
    state.sprints.set(`${projectId}/${sprint.id}`, sprint)

    const listed = (await call(api, READ_TOOL.getSprint)) as { total: number }
    const one = (await call(api, READ_TOOL.getSprint, { sprintId: 'sprint-1' })) as {
      sprint: Record<string, unknown>
      progress: Record<string, unknown>
    }

    expect(listed.total).toBe(1)
    expect(one.sprint['name']).toBe('sprint one')
    expect(one.progress['total']).toEqual({ count: 0, estimate: 0 })
  })
})

describe('a workspace with no project', () => {
  it('refuses to read one rather than inventing an empty answer', async () => {
    const state = store()
    const { api } = await boundHost(state)
    state.bindings.clear()

    const error = await call(api, READ_TOOL.getProject).catch((caught: unknown) => caught)

    expect((error as { code?: string }).code).toBe('VALIDATION')
  })
})

describe('identity', () => {
  it('acts as the user the host resolved, never as anyone else', async () => {
    const state = store()
    const { api } = await boundHost(state)

    await call(api, READ_TOOL.getProject)

    expect(state.actors.length).toBeGreaterThan(0)
    expect(new Set(state.actors)).toEqual(new Set([IDENTITY]))
  })

  it('offers no parameter for who is asking', () => {
    const names = createReadTools({} as never).flatMap((tool) =>
      Object.keys(
        (tool as { parameters?: { properties?: Record<string, unknown> } }).parameters
          ?.properties ?? {},
      ),
    )

    expect(names).not.toContain('actor')
    expect(names).not.toContain('identityId')
    expect(names).not.toContain('userId')
  })
})
