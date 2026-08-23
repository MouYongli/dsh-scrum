import { describe, expect, it } from 'vitest'
import {
  SCRUM_CHANNEL,
  SCRUM_ENDPOINT,
  SCRUM_INPUT,
  isScrumEndpoint,
  scrumCallSchema,
} from '@dsh-scrum/scrum-api-contract'

describe('the channel', () => {
  it('is absolute, because the host registry keys channels by path', () => {
    expect(SCRUM_CHANNEL.startsWith('/')).toBe(true)
  })

  it('owns exactly the endpoints it declares', () => {
    for (const endpoint of Object.values(SCRUM_ENDPOINT)) {
      expect(isScrumEndpoint(endpoint)).toBe(true)
    }
    expect(isScrumEndpoint('workItem.delete')).toBe(false)
    expect(isScrumEndpoint('project.configure')).toBe(false)
  })

  it('has an input schema for every endpoint, so dispatch cannot reach an unparsed one', () => {
    for (const endpoint of Object.values(SCRUM_ENDPOINT)) {
      expect(SCRUM_INPUT[endpoint]).toBeDefined()
    }
  })
})

describe('the call shell', () => {
  it('carries the workspace and session the caller is looking at', () => {
    const parsed = scrumCallSchema.parse({
      scope: { workspaceId: 'ws-1', sessionId: 'se-1' },
      input: {},
    })

    expect(parsed.scope).toEqual({ workspaceId: 'ws-1', sessionId: 'se-1' })
  })

  it('accepts neither, because the workbench opens before a workspace is chosen', () => {
    const parsed = scrumCallSchema.parse({
      scope: { workspaceId: null, sessionId: null },
      input: {},
    })

    expect(parsed.scope.workspaceId).toBeNull()
  })

  it('rejects a blank id rather than treating it as absent', () => {
    const result = scrumCallSchema.safeParse({
      scope: { workspaceId: '  ', sessionId: null },
      input: {},
    })

    expect(result.success).toBe(false)
  })
})

describe('the endpoint inputs', () => {
  it('parses a work item the domain would accept', () => {
    const result = SCRUM_INPUT[SCRUM_ENDPOINT.createWorkItem].safeParse({
      type: 'story',
      title: '用户登录流程',
      priority: 'high',
    })

    expect(result.success).toBe(true)
  })

  it('refuses a work item type no rule knows', () => {
    // The domain reads `type` straight onto the entity, so this is the only
    // place the value is checked: an unparsed payload would be stored.
    const result = SCRUM_INPUT[SCRUM_ENDPOINT.createWorkItem].safeParse({
      type: 'chore',
      title: 'x',
    })

    expect(result.success).toBe(false)
  })

  it('parses the category, the parent and the details a type carries', () => {
    const result = SCRUM_INPUT[SCRUM_ENDPOINT.createWorkItem].safeParse({
      type: 'bug',
      title: '保存后页面白屏',
      category: 'defect',
      parentId: 'SCR-1',
      typeDetails: { type: 'bug', severity: 'blocker', isRegression: true },
    })

    expect(result.success).toBe(true)
  })

  it('refuses details carrying a field the type does not own', () => {
    // Strict on purpose: a key no shape owns can only come from a caller
    // confusing two types, and this is where it still holds what it meant.
    const result = SCRUM_INPUT[SCRUM_ENDPOINT.createWorkItem].safeParse({
      type: 'epic',
      title: 'x',
      typeDetails: { type: 'epic', severity: 'blocker' },
    })

    expect(result.success).toBe(false)
  })

  it('refuses a category and a severity no rule knows', () => {
    expect(
      SCRUM_INPUT[SCRUM_ENDPOINT.createWorkItem].safeParse({
        type: 'task',
        title: 'x',
        category: 'chore',
      }).success,
    ).toBe(false)
    expect(
      SCRUM_INPUT[SCRUM_ENDPOINT.createWorkItem].safeParse({
        type: 'bug',
        title: 'x',
        typeDetails: { type: 'bug', severity: 'catastrophic' },
      }).success,
    ).toBe(false)
  })

  it('refuses a priority no rule knows', () => {
    const result = SCRUM_INPUT[SCRUM_ENDPOINT.createWorkItem].safeParse({
      type: 'task',
      title: 'x',
      priority: 'urgent',
    })

    expect(result.success).toBe(false)
  })

  it('refuses a board column that is not a status', () => {
    const result = SCRUM_INPUT[SCRUM_ENDPOINT.moveWorkItemStatus].safeParse({
      workItemId: 'SCR-1',
      expectedRevision: 1,
      status: 'shipped',
    })

    expect(result.success).toBe(false)
  })

  it('requires an expected revision on a write, so a blind overwrite has no spelling', () => {
    const result = SCRUM_INPUT[SCRUM_ENDPOINT.blockWorkItem].safeParse({
      workItemId: 'SCR-1',
      reason: 'waiting on the API',
    })

    expect(result.success).toBe(false)
  })

  it('refuses a revision that is not a positive integer', () => {
    const result = SCRUM_INPUT[SCRUM_ENDPOINT.blockWorkItem].safeParse({
      workItemId: 'SCR-1',
      expectedRevision: 0,
      reason: null,
    })

    expect(result.success).toBe(false)
  })

  it('keeps the three backlog answers apart', () => {
    const board = SCRUM_INPUT[SCRUM_ENDPOINT.backlog].safeParse({ sprintId: 'sprint-1' })
    const backlogOnly = SCRUM_INPUT[SCRUM_ENDPOINT.backlog].safeParse({ sprintId: null })
    const everything = SCRUM_INPUT[SCRUM_ENDPOINT.backlog].safeParse({})

    expect(board.success).toBe(true)
    expect(backlogOnly.success && backlogOnly.data.sprintId).toBeNull()
    expect(everything.success && 'sprintId' in everything.data).toBe(false)
  })

  it('refuses a sprint whose dates are not canonical instants', () => {
    const result = SCRUM_INPUT[SCRUM_ENDPOINT.createSprint].safeParse({
      name: 'Sprint 1',
      startDate: '2026-08-01',
      endDate: '2026-08-14T00:00:00.000Z',
    })

    expect(result.success).toBe(false)
  })
})
