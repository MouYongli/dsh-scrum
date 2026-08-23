import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WORK_ITEM_TYPE } from '@dsh-scrum/scrum-domain'
import { WorkItemTimeline, backlogPage, createTranslate, timelineView } from '@dsh-scrum/scrum-ui'
import type { TimelineProps } from '@dsh-scrum/scrum-ui'
import { item, sprint } from '../support/items.js'

const t = createTranslate()
const FIRST = sprint(1)

function state(
  items: Parameters<typeof backlogPage>[0],
  phase: TimelineProps['state']['phase'] = 'ready',
): TimelineProps['state'] {
  return {
    phase,
    query: {},
    grouping: 'none',
    page: backlogPage(items, 'none', false),
    ordered: items,
    selected: null,
    failure: phase === 'failed' ? { kind: 'other', message: '主机不可达' } : null,
    busy: false,
  }
}

function render(
  items: Parameters<typeof backlogPage>[0],
  sprints: readonly (typeof FIRST)[] = [FIRST],
  phase: TimelineProps['state']['phase'] = 'ready',
): string {
  return renderToStaticMarkup(
    createElement(WorkItemTimeline, {
      state: state(items, phase),
      view: timelineView({ items, sprints }),
      t,
    }),
  )
}

describe('the states the timeline can be in', () => {
  it('says it is reading, and draws no grid yet', () => {
    const markup = render([], [FIRST], 'loading')

    expect(markup).toContain('data-scrum-timeline="loading"')
    expect(markup).not.toContain('data-scrum-timeline-axis')
  })

  it('shows the message when the read failed', () => {
    expect(render([], [FIRST], 'failed')).toContain('主机不可达')
  })

  it('explains itself rather than drawing an empty grid when there are no sprints', () => {
    const markup = render([item(1)], [])

    // An empty grid would read as "nothing is planned" rather than "nothing
    // can be placed yet".
    expect(markup).toContain('data-scrum-timeline="no-sprints"')
    expect(markup).toContain(t('timeline.noSprints.title'))
  })
})

describe('the grid', () => {
  it('lays a lane of sprints under the bars', () => {
    const markup = render([item(1, { sprintId: FIRST.id })])

    expect(markup).toContain(`data-scrum-timeline-column="${FIRST.id}"`)
    expect(markup).toContain(FIRST.name)
  })

  it('draws a bar for scheduled work and names the dates it covers', () => {
    const markup = render([item(1, { sprintId: FIRST.id, title: '结算对账' })])

    expect(markup).toContain('data-scrum-timeline-bar="SCR-1"')
    expect(markup).toContain('2026-03-01 — 2026-03-15')
    expect(markup).toContain('SCR-1 · 结算对账')
  })

  it('lists work in no sprint apart, and says why it has no bar', () => {
    const markup = render([item(1), item(2, { sprintId: FIRST.id })])

    expect(markup).toContain('data-scrum-timeline-unscheduled="1"')
    expect(markup).toContain(t('timeline.unscheduled.hint'))
  })

  it('shows an epic as a percentage and a leaf as its type and status', () => {
    const epic = item(1, { type: WORK_ITEM_TYPE.epic })
    const markup = render([epic, item(2, { parentId: epic.id, sprintId: FIRST.id, estimate: 4 })])

    expect(markup).toContain('0%')
    expect(markup).toContain(t('status.backlog'))
  })

  it('says the filter matched nothing scheduled rather than showing a bare axis', () => {
    const markup = render([])

    expect(markup).toContain('data-scrum-timeline-empty')
    expect(markup).toContain(t('timeline.empty'))
  })
})
