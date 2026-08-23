import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SPRINT_STATUS, WORK_ITEM_STATUS, toTimestamp } from '@dsh-scrum/scrum-domain'
import { DashboardScreen, createTranslate, dashboardView } from '@dsh-scrum/scrum-ui'
import type {
  DashboardInput,
  DashboardState,
  ProjectSettingsView,
  ProjectView,
  SprintReportView,
} from '@dsh-scrum/scrum-ui'
import { item, itemId, sprint } from '../support/items.js'

// Rendered to markup rather than asserted as an element tree: a tree assertion
// passes while the page shows nothing, because a component that returned the
// wrong branch still returned elements.

const t = createTranslate()
const NOW = toTimestamp('2026-03-05T09:00:00.000Z')
const RUNNING = sprint(1, { status: SPRINT_STATUS.active, goal: '打通结算' })

const PROJECT: ProjectView = {
  id: 'prj_1',
  key: 'SCR',
  name: 'shop-service',
  description: '结算与对账',
}

const SETTINGS: ProjectSettingsView = {
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
}

function report(): SprintReportView {
  return {
    progress: {
      sprintId: RUNNING.id,
      byStatus: {} as SprintReportView['progress']['byStatus'],
      total: { count: 3, estimate: 10 },
      finished: { count: 2, estimate: 6 },
      delivered: { count: 1, estimate: 4 },
      unestimated: 1,
    },
    baseline: {
      sprintId: RUNNING.id,
      recordedAt: toTimestamp('2026-03-01T09:00:00.000Z'),
      itemIds: [itemId(1)],
      totalPoints: 8,
      unestimatedCount: 0,
    },
    scopeChange: { sprintId: RUNNING.id, added: [itemId(2)], removed: [], committedPoints: 8 },
  }
}

function ready(overrides: Partial<DashboardInput> = {}): DashboardState {
  return {
    phase: 'ready',
    view: dashboardView({
      items: [],
      sprints: [],
      report: null,
      activity: [],
      settings: SETTINGS,
      now: NOW,
      ...overrides,
    }),
    failure: null,
    problems: [],
  }
}

function render(state: DashboardState): string {
  return renderToStaticMarkup(
    createElement(DashboardScreen, {
      state,
      project: PROJECT,
      t,
      actions: { refresh: vi.fn() },
    }),
  )
}

describe('the states the dashboard can be in', () => {
  it('says it is reading, and shows no panels yet', () => {
    const markup = render({ phase: 'loading', view: null, failure: null, problems: [] })

    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain(t('dashboard.loading'))
    expect(markup).not.toContain('data-scrum-signals')
  })

  it('shows the project and the message when the read failed', () => {
    const markup = render({
      phase: 'failed',
      view: null,
      failure: { kind: 'other', message: '主机不可达' },
      problems: [],
    })

    // The heading stays: knowing which project failed to load is the first
    // thing somebody needs.
    expect(markup).toContain('shop-service')
    expect(markup).toContain('主机不可达')
    expect(markup).not.toContain('data-scrum-burndown')
  })

  it('says no sprint is running rather than drawing an empty summary', () => {
    const markup = render(ready({ sprints: [sprint(2)] }))

    expect(markup).toContain('data-scrum-empty="no-sprint"')
    expect(markup).toContain(t('dashboard.noSprint.title'))
    expect(markup).not.toContain('data-scrum-burndown')
  })
})

describe('the sprint summary', () => {
  it('names the sprint, its goal, its dates and both ways of finishing', () => {
    const markup = render(ready({ sprints: [RUNNING], report: report() }))

    expect(markup).toContain(`data-scrum-current-sprint="${RUNNING.id}"`)
    expect(markup).toContain('打通结算')
    expect(markup).toContain('2026-03-01 — 2026-03-15')
    // Delivered and off the board are different questions, so both are shown.
    expect(markup).toContain('1/3 · 4/10')
    expect(markup).toContain('2/3')
  })
})

describe('the burndown', () => {
  it('draws the two points that exist and says why there are only two', () => {
    const markup = render(ready({ sprints: [RUNNING], report: report() }))

    expect(markup).toContain('data-scrum-committed')
    expect(markup).toContain('data-scrum-remaining')
    expect(markup).toContain('data-scrum-ideal')
    expect(markup).toContain(t('burndown.note'))
  })

  it('is absent for a sprint that never opened', () => {
    const markup = render(
      ready({ sprints: [RUNNING], report: { ...report(), baseline: null, scopeChange: null } }),
    )

    expect(markup).not.toContain('data-scrum-burndown')
  })

  it('reports scope change beside it, and only when the scope moved', () => {
    expect(render(ready({ sprints: [RUNNING], report: report() }))).toContain(
      'data-scrum-scope-change',
    )
    expect(
      render(
        ready({
          sprints: [RUNNING],
          report: {
            ...report(),
            scopeChange: { sprintId: RUNNING.id, added: [], removed: [], committedPoints: 8 },
          },
        }),
      ),
    ).not.toContain('data-scrum-scope-change')
  })
})

describe('the signals', () => {
  it('says nothing needs attention rather than showing four empty headings', () => {
    const markup = render(ready({ sprints: [RUNNING] }))

    expect(markup).toContain('data-scrum-signals-none')
    expect(markup).not.toContain('data-scrum-signal="blocked"')
  })

  it('heads each signal with its count and what to do about it', () => {
    const markup = render(
      ready({
        sprints: [RUNNING],
        items: [
          item(1, {
            sprintId: RUNNING.id,
            status: WORK_ITEM_STATUS.todo,
            estimate: 3,
            blockedReason: '等待接口',
            title: '结算对账',
          }),
        ],
        activity: [],
      }),
    )

    expect(markup).toContain('data-scrum-signal="blocked"')
    expect(markup).toContain(`${t('signal.blocked')} 1`)
    expect(markup).toContain(t('signal.blocked.hint'))
    expect(markup).toContain('SCR-1 · 结算对账')
  })
})

describe('recent activity', () => {
  it('says nothing has happened rather than showing an empty list', () => {
    expect(render(ready({ sprints: [RUNNING] }))).toContain(t('dashboard.activity.none'))
  })

  it('warns when part of the history could not be read', () => {
    const markup = render({
      ...ready({ sprints: [RUNNING] }),
      problems: ['2026-03.jsonl:4 was cut short by an interrupted write'],
    })

    expect(markup).toContain('data-scrum-activity-problems="1"')
    expect(markup).toContain(t('dashboard.activity.problems'))
  })
})
