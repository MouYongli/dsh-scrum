import { describe, expect, it } from 'vitest'
import {
  PRIORITY,
  SPRINT_STATUS,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  createDefaultProjectConfig,
  createProject,
  createSprint,
  createWorkItem,
  formatSprintId,
  formatWorkItemId,
  toIdentityId,
  toProjectKey,
  toRank,
  toTenantId,
  toTimestamp,
} from '@dsh-scrum/scrum-domain'
import {
  READ_TOOL_NAMES,
  createReadTools,
  progressSummary,
  projectSummary,
  sprintSummary,
  workItemDetail,
  workItemSummary,
} from '@dsh-scrum/scrum-agent-tools'

// What the model actually reads. The summaries are pinned because every field
// here is replayed into every later turn of the conversation, so one added by
// accident costs context on every request from then on.

const NOW = toTimestamp('2026-08-22T09:00:00.000Z')
const REPORTER = toIdentityId('idt_01K00000000000000000000001')

const project = createProject({
  ids: { nextUlid: () => '01K00000000000000000000001' },
  tenantId: toTenantId('tnt_01K00000000000000000000001'),
  key: toProjectKey('SCR'),
  name: 'shop-service',
  createdBy: REPORTER,
  now: NOW,
})

const item = createWorkItem({
  id: formatWorkItemId(toProjectKey('SCR'), 12),
  projectId: project.id,
  type: WORK_ITEM_TYPE.bug,
  title: 'the coupon does not apply',
  description: 'steps to reproduce',
  priority: PRIORITY.high,
  labels: ['checkout'],
  acceptanceCriteria: [{ text: 'the total drops', satisfied: false }],
  reporterId: REPORTER,
  rank: toRank('a'),
  now: NOW,
})

const sprint = createSprint({
  id: formatSprintId(3),
  projectId: project.id,
  name: 'sprint three',
  goal: 'coupons',
  startDate: NOW,
  endDate: toTimestamp('2026-09-05T09:00:00.000Z'),
  createdBy: REPORTER,
  now: NOW,
})

describe('the summaries a tool returns', () => {
  it('projects the project without leaking anything else', () => {
    const summary = projectSummary(project, createDefaultProjectConfig(project.id, NOW))

    expect(Object.keys(summary).sort()).toEqual([
      'description',
      'estimationMethod',
      'id',
      'key',
      'name',
      'revision',
      'sprintLengthInDays',
      'status',
      'statuses',
    ])
    // The tenant is the installation's business, not the model's.
    expect(JSON.stringify(summary)).not.toContain('tnt_')
  })

  it('projects a work item card without its body', () => {
    const summary = workItemSummary(item)

    expect(summary.title).toBe('the coupon does not apply')
    expect(summary.status).toBe(WORK_ITEM_STATUS.backlog)
    expect(Object.keys(summary)).not.toContain('description')
    expect(Object.keys(summary)).not.toContain('acceptanceCriteria')
  })

  it('projects the full item when one was asked for by name', () => {
    const detail = workItemDetail(item)

    expect(detail.description).toBe('steps to reproduce')
    expect(detail.labels).toEqual(['checkout'])
    expect(detail.acceptanceCriteria).toEqual([{ text: 'the total drops', satisfied: false }])
  })

  it('projects a sprint and its progress', () => {
    expect(sprintSummary(sprint)).toMatchObject({
      id: 'sprint-3',
      goal: 'coupons',
      status: SPRINT_STATUS.planned,
    })
    expect(
      progressSummary({
        sprintId: sprint.id,
        byStatus: { todo: { count: 1, estimate: 2 } } as never,
        total: { count: 1, estimate: 2 },
        finished: { count: 0, estimate: 0 },
        delivered: { count: 0, estimate: 0 },
        unestimated: 0,
      }),
    ).toMatchObject({ sprintId: 'sprint-3', total: { count: 1, estimate: 2 } })
  })
})

describe('the tool definitions', () => {
  const tools = createReadTools({} as never)

  it('publishes exactly the read tool names', () => {
    expect(tools.map((tool) => tool.name)).toEqual([...READ_TOOL_NAMES])
  })

  it('renders every result as text the model can read', () => {
    for (const tool of tools) {
      const rendered = (
        tool as unknown as {
          output: { render(args: unknown, value: unknown): { type: string; text: string }[] }
        }
      ).output.render({}, { ok: true })

      expect(rendered).toEqual([{ type: 'text', text: '{\n  "ok": true\n}' }])
    }
  })

  it('classifies every read as safe to run beside another', () => {
    // Valid arguments for every tool at once: the parameter root is open, so
    // the extras are ignored by the ones that do not declare them.
    const args = { workItemId: 'SCR-1', sprintId: 'sprint-1', limit: 5 }

    for (const tool of tools) {
      expect(
        (tool as unknown as { isConcurrencySafe(args: unknown): boolean }).isConcurrencySafe(args),
      ).toBe(true)
    }
  })

  it('describes every tool, because an undescribed tool is one the model guesses at', () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(20)
    }
  })
})
