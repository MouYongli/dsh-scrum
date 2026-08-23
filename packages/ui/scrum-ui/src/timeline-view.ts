import { createElement, type ReactElement } from 'react'
import type { BacklogState } from './backlog-controller.js'
import type { Translate } from './messages.js'
import { LoadingSkeleton } from './skeleton.js'
import type { TimelineRow, TimelineView } from './timeline.js'
import { statusLabel, typeLabel } from './vocabulary.js'

export interface TimelineProps {
  readonly state: BacklogState
  readonly view: TimelineView
  readonly t: Translate
}

/**
 * When the work happens, as a grid of sprints.
 *
 * The same query as the list, drawn along time instead of down a table. What
 * it can say is bounded by what the model stores: sprints have dates and work
 * items do not, so the grid is one column per sprint and a bar is the stretch
 * of sprints an item sits in.
 */
export function WorkItemTimeline(props: TimelineProps): ReactElement {
  const { t, state, view } = props
  if (state.phase === 'loading') {
    return createElement(
      'p',
      { role: 'status', 'data-scrum-timeline': 'loading' },
      t('backlog.loading'),
      createElement(LoadingSkeleton, { rows: 6 }),
    )
  }
  if (state.phase === 'failed') {
    return createElement(
      'div',
      { role: 'alert', 'data-scrum-timeline': 'failed' },
      createElement('p', null, t('error.title')),
      createElement('p', null, state.failure?.message ?? ''),
    )
  }
  if (view.columns.length === 0) {
    // Without a single sprint there is no time axis to draw against, and an
    // empty grid would read as "nothing is planned" rather than "nothing can
    // be placed yet".
    return createElement(
      'div',
      { 'data-scrum-timeline': 'no-sprints' },
      createElement('h4', null, t('timeline.noSprints.title')),
      createElement('p', null, t('timeline.noSprints.body')),
    )
  }
  return createElement(
    'div',
    { 'data-scrum-timeline': 'grid' },
    axis(props),
    view.rows.length === 0
      ? createElement('p', { 'data-scrum-timeline-empty': true }, t('timeline.empty'))
      : createElement(
          'ul',
          { 'data-scrum-timeline-rows': true },
          view.rows.map((row) => rowFor(row, 0, props)),
        ),
    view.unscheduled.length === 0 ? null : unscheduled(props),
  )
}

/** The sprint lane, which every bar above it is read against. */
function axis(props: TimelineProps): ReactElement {
  const { view } = props
  return createElement(
    'div',
    { 'data-scrum-timeline-axis': true, 'aria-hidden': true },
    view.columns.map((column) =>
      createElement(
        'span',
        { key: column.sprint.id, 'data-scrum-timeline-column': column.sprint.id },
        column.sprint.name,
      ),
    ),
  )
}

function rowFor(row: TimelineRow, depth: number, props: TimelineProps): ReactElement {
  const { t } = props
  const item = row.item
  return createElement(
    'li',
    { key: item.id, 'data-scrum-timeline-row': item.id, 'data-scrum-depth': depth },
    createElement(
      'span',
      { 'data-scrum-timeline-label': true, style: { paddingInlineStart: `${depth * 16}px` } },
      `${item.id} · ${item.title}`,
    ),
    createElement(
      'span',
      { 'data-scrum-timeline-track': true },
      row.bar === null
        ? null
        : createElement('span', {
            'data-scrum-timeline-bar': item.id,
            title: `${day(row.bar.span.start)} — ${day(row.bar.span.end)}`,
            style: {
              insetInlineStart: `${row.bar.from * 100}%`,
              inlineSize: `${Math.max(1, (row.bar.to - row.bar.from) * 100)}%`,
            },
          }),
    ),
    createElement(
      'span',
      { 'data-scrum-timeline-meta': true },
      row.progress === null
        ? `${t(typeLabel(item.type))} · ${t(statusLabel(item.status))}`
        : `${percent(row.progress.delivered, row.progress.total)}%`,
    ),
    row.children.length === 0
      ? null
      : createElement(
          'ul',
          null,
          row.children.map((child) => rowFor(child, depth + 1, props)),
        ),
  )
}

function unscheduled(props: TimelineProps): ReactElement {
  const { t, view } = props
  return createElement(
    'section',
    { 'data-scrum-timeline-unscheduled': view.unscheduled.length },
    createElement('h4', null, `${t('timeline.unscheduled')} ${view.unscheduled.length}`),
    createElement('p', null, t('timeline.unscheduled.hint')),
    createElement(
      'ul',
      null,
      view.unscheduled.map((row) =>
        createElement(
          'li',
          { key: row.item.id, 'data-scrum-timeline-row': row.item.id },
          `${row.item.id} · ${row.item.title}`,
        ),
      ),
    ),
  )
}

function percent(value: number, of: number): number {
  return of <= 0 ? 0 : Math.round((value / of) * 100)
}

function day(at: string): string {
  return at.slice(0, 'yyyy-mm-dd'.length)
}
