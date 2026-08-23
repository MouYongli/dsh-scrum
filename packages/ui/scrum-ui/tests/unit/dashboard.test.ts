import { describe, expect, it } from 'vitest'
import {
  SPRINT_STATUS,
  WORK_ITEM_RESOLUTION,
  WORK_ITEM_STATUS,
  toIdentityId,
  toTimestamp,
} from '@dsh-scrum/scrum-domain'
import { DASHBOARD_SIGNAL, dashboardView } from '@dsh-scrum/scrum-ui'
import type {
  ActivityEventView,
  DashboardInput,
  ProjectSettingsView,
  SprintReportView,
} from '@dsh-scrum/scrum-ui'
import { item, itemId, sprint, sprintId } from '../support/items.js'

const NOW = toTimestamp('2026-03-05T09:00:00.000Z')
const ACTOR = toIdentityId('idt_01ARZ3NDEKTSV4RRFFQ69G5FAW')

function settings(overrides: Partial<ProjectSettingsView> = {}): ProjectSettingsView {
  return {
    revision: 1 as ProjectSettingsView['revision'],
    statuses: [],
    statusDisplayNames: {},
    estimationMethod: 'story_points',
    sprintLengthInDays: 14,
    definitionOfReady: [],
    definitionOfDone: [],
    workInProgressLimit: null,
    velocityBasis: 'delivered',
    stalledAfterDays: 3,
    ...overrides,
  }
}

function report(overrides: Partial<SprintReportView> = {}): SprintReportView {
  return {
    progress: {
      sprintId: sprintId(1),
      byStatus: {} as SprintReportView['progress']['byStatus'],
      total: { count: 0, estimate: 0 },
      finished: { count: 0, estimate: 0 },
      delivered: { count: 0, estimate: 0 },
      unestimated: 0,
    },
    baseline: null,
    scopeChange: null,
    ...overrides,
  }
}

function moved(sequence: number, at: string): ActivityEventView {
  return {
    at: toTimestamp(at),
    actorId: ACTOR,
    source: 'ui',
    sessionId: null,
    action: 'workItem.status',
    targetType: 'workItem',
    targetId: itemId(sequence),
    revision: null,
  }
}

function input(overrides: Partial<DashboardInput> = {}): DashboardInput {
  return {
    items: [],
    sprints: [],
    report: null,
    activity: [],
    settings: settings(),
    now: NOW,
    ...overrides,
  }
}

const RUNNING = sprint(1, { status: SPRINT_STATUS.active })

describe('which sprint the dashboard is about', () => {
  it('shows the running one, not whichever was planned first', () => {
    const view = dashboardView(input({ sprints: [sprint(2), RUNNING] }))

    expect(view.sprint?.id).toBe(RUNNING.id)
  })

  it('shows none rather than the next one when nothing is running', () => {
    expect(dashboardView(input({ sprints: [sprint(2)] })).sprint).toBeNull()
  })
})

describe('the four signals', () => {
  function signalled(view: ReturnType<typeof dashboardView>, signal: string): readonly string[] {
    return (view.signals.find((group) => group.signal === signal)?.items ?? []).map((one) => one.id)
  }

  it('leaves out a signal with nothing in it rather than showing a zero', () => {
    const view = dashboardView(input({ sprints: [RUNNING] }))

    expect(view.signals).toEqual([])
  })

  it('names blocked and unsized work that is in the running sprint', () => {
    const view = dashboardView(
      input({
        sprints: [RUNNING],
        items: [
          item(1, { sprintId: RUNNING.id, status: WORK_ITEM_STATUS.todo, blockedReason: '等接口' }),
          item(2, { sprintId: RUNNING.id, status: WORK_ITEM_STATUS.todo, estimate: 3 }),
          // In the backlog, so neither its size nor its age is a question for
          // today.
          item(3, { blockedReason: '等接口' }),
        ],
        activity: [moved(1, '2026-03-05T08:00:00.000Z'), moved(2, '2026-03-05T08:00:00.000Z')],
      }),
    )

    expect(signalled(view, DASHBOARD_SIGNAL.blocked)).toEqual([itemId(1)])
    expect(signalled(view, DASHBOARD_SIGNAL.unestimated)).toEqual([itemId(1)])
  })

  it('leaves finished work out of every signal', () => {
    const view = dashboardView(
      input({
        sprints: [RUNNING],
        items: [
          item(1, {
            sprintId: RUNNING.id,
            status: WORK_ITEM_STATUS.done,
            resolution: WORK_ITEM_RESOLUTION.done,
            blockedReason: '等接口',
          }),
        ],
      }),
    )

    expect(view.signals).toEqual([])
  })

  it('calls an item stalled once it has not moved for the configured days', () => {
    const view = dashboardView(
      input({
        sprints: [RUNNING],
        items: [
          item(1, { sprintId: RUNNING.id, status: WORK_ITEM_STATUS.inProgress, estimate: 3 }),
          item(2, { sprintId: RUNNING.id, status: WORK_ITEM_STATUS.inProgress, estimate: 3 }),
        ],
        activity: [moved(1, '2026-03-01T09:00:00.000Z'), moved(2, '2026-03-04T09:00:00.000Z')],
      }),
    )

    expect(signalled(view, DASHBOARD_SIGNAL.stalled)).toEqual([itemId(1)])
  })

  it('reads the threshold from the project rather than a constant', () => {
    const items = [item(1, { sprintId: RUNNING.id, status: WORK_ITEM_STATUS.inProgress })]
    const activity = [moved(1, '2026-03-04T09:00:00.000Z')]
    const patient = dashboardView(
      input({ sprints: [RUNNING], items, activity, settings: settings({ stalledAfterDays: 7 }) }),
    )
    const impatient = dashboardView(
      input({ sprints: [RUNNING], items, activity, settings: settings({ stalledAfterDays: 1 }) }),
    )

    expect(signalled(patient, DASHBOARD_SIGNAL.stalled)).toEqual([])
    expect(signalled(impatient, DASHBOARD_SIGNAL.stalled)).toEqual([itemId(1)])
  })

  it('does not call work in the first column stalled, because nobody picked it up', () => {
    const view = dashboardView(
      input({
        sprints: [RUNNING],
        items: [item(1, { sprintId: RUNNING.id, status: WORK_ITEM_STATUS.backlog, estimate: 3 })],
        activity: [moved(1, '2026-01-01T09:00:00.000Z')],
      }),
    )

    expect(signalled(view, DASHBOARD_SIGNAL.stalled)).toEqual([])
  })

  it('names what arrived after the sprint opened, from the baseline', () => {
    const view = dashboardView(
      input({
        sprints: [RUNNING],
        items: [
          item(1, { sprintId: RUNNING.id, status: WORK_ITEM_STATUS.todo, estimate: 3 }),
          item(2, { sprintId: RUNNING.id, status: WORK_ITEM_STATUS.todo, estimate: 5 }),
        ],
        activity: [moved(1, NOW), moved(2, NOW)],
        report: report({
          baseline: {
            sprintId: RUNNING.id,
            recordedAt: toTimestamp('2026-03-01T09:00:00.000Z'),
            itemIds: [itemId(1)],
            totalPoints: 3,
            unestimatedCount: 0,
          },
          scopeChange: {
            sprintId: RUNNING.id,
            added: [itemId(2)],
            removed: [],
            committedPoints: 3,
          },
        }),
      }),
    )

    expect(signalled(view, DASHBOARD_SIGNAL.added)).toEqual([itemId(2)])
  })
})

describe('the burndown', () => {
  it('is not drawn at all for a sprint that never opened', () => {
    // A line from zero would claim the team committed to nothing, which is a
    // different statement from having nothing recorded yet.
    expect(dashboardView(input({ sprints: [RUNNING], report: report() })).burndown).toBeNull()
    expect(dashboardView(input({ sprints: [sprint(2)] })).burndown).toBeNull()
  })

  it('draws the committed point, what is left, and where it should be by now', () => {
    const view = dashboardView(
      input({
        sprints: [RUNNING],
        report: report({
          progress: {
            ...report().progress,
            total: { count: 2, estimate: 10 },
            delivered: { count: 1, estimate: 4 },
          },
          baseline: {
            sprintId: RUNNING.id,
            recordedAt: toTimestamp('2026-03-01T09:00:00.000Z'),
            itemIds: [itemId(1)],
            totalPoints: 8,
            unestimatedCount: 0,
          },
        }),
      }),
    )

    expect(view.burndown?.committed).toBe(8)
    // Against the sprint's own total, so work that arrived after it opened is
    // counted as work still to do.
    expect(view.burndown?.remaining).toBe(6)
    // Four days into a fourteen-day sprint.
    expect(view.burndown?.elapsed).toBeCloseTo(2 / 7)
    expect(view.burndown?.ideal).toBeCloseTo(8 * (1 - 2 / 7))
  })
})
