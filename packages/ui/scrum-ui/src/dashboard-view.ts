import { createElement, type ReactElement } from 'react'
import type { WorkItem } from '@dsh-scrum/scrum-domain'
import type { ActivityEventView, ProjectView, SprintReportView } from './client.js'
import type { DashboardState } from './dashboard-controller.js'
import type { BurndownView, DashboardSignal, SignalGroup } from './dashboard.js'
import type { MessageKey, Translate } from './messages.js'
import { statusLabel, typeLabel } from './vocabulary.js'

export interface DashboardActions {
  readonly refresh: () => void
}

export interface DashboardProps {
  readonly state: DashboardState
  readonly project: ProjectView
  readonly actions: DashboardActions
  readonly t: Translate
}

/**
 * Every signal's heading and the sentence under it.
 *
 * A total record: a signal added to the vocabulary without copy here does not
 * compile, which is the only thing standing between a new signal and a panel
 * headed by its own identifier.
 */
const SIGNAL_COPY: Readonly<Record<DashboardSignal, { title: MessageKey; hint: MessageKey }>> = {
  blocked: { title: 'signal.blocked', hint: 'signal.blocked.hint' },
  stalled: { title: 'signal.stalled', hint: 'signal.stalled.hint' },
  unestimated: { title: 'signal.unestimated', hint: 'signal.unestimated.hint' },
  added: { title: 'signal.added', hint: 'signal.added.hint' },
}

export function DashboardScreen(props: DashboardProps): ReactElement {
  const { t, state } = props
  return createElement(
    'section',
    { 'data-scrum-home': true, 'aria-busy': state.phase === 'loading' },
    heading(props),
    state.phase === 'loading' ? createElement('p', null, t('dashboard.loading')) : null,
    state.phase === 'failed'
      ? createElement(
          'p',
          { role: 'alert', 'data-scrum-failure': state.failure?.kind ?? 'other' },
          state.failure?.message ?? t('error.title'),
        )
      : null,
    state.view === null ? null : body(props),
  )
}

function heading(props: DashboardProps): ReactElement {
  return createElement(
    'div',
    { 'data-scrum-project-heading': true },
    createElement('h2', null, props.project.name),
    createElement('p', { 'data-scrum-project': props.project.key }, props.project.key),
    props.project.description === ''
      ? null
      : createElement('p', { 'data-scrum-project-description': true }, props.project.description),
  )
}

function body(props: DashboardProps): ReactElement {
  const view = props.state.view
  return createElement(
    'div',
    { 'data-scrum-dashboard': true },
    view === null || view.sprint === null ? noSprint(props) : sprintSummary(props),
    view?.burndown === undefined || view.burndown === null
      ? null
      : burndownPanel(view.burndown, props),
    signals(props),
    activity(props),
  )
}

function noSprint(props: DashboardProps): ReactElement {
  const { t } = props
  return createElement(
    'section',
    { 'data-scrum-empty': 'no-sprint' },
    createElement('h3', null, t('dashboard.noSprint.title')),
    createElement('p', null, t('dashboard.noSprint.body')),
  )
}

function sprintSummary(props: DashboardProps): ReactElement {
  const { t } = props
  const view = props.state.view
  const sprint = view?.sprint
  const report = view?.report ?? null
  if (sprint === undefined || sprint === null) {
    return noSprint(props)
  }
  return createElement(
    'section',
    { 'data-scrum-current-sprint': sprint.id },
    createElement('h3', null, `${t('dashboard.sprint')} · ${sprint.name}`),
    sprint.goal === ''
      ? null
      : createElement(
          'p',
          { 'data-scrum-sprint-goal': true },
          `${t('dashboard.goal')} ${sprint.goal}`,
        ),
    createElement(
      'p',
      { 'data-scrum-sprint-dates': true },
      `${day(sprint.startDate)} — ${day(sprint.endDate)}`,
    ),
    report === null ? null : totals(report, t),
  )
}

/**
 * Delivered and off the board are both shown.
 *
 * Everything in the last column has left the board, and only some of it was
 * delivered — the rest was dropped, deduplicated or never reproduced. One
 * number covering both would let a sprint rescued by abandoning half its work
 * read as a finished one.
 */
function totals(report: SprintReportView, t: Translate): ReactElement {
  const progress = report.progress
  return createElement(
    'dl',
    { 'data-scrum-sprint-totals': true },
    createElement('dt', null, t('dashboard.delivered')),
    createElement(
      'dd',
      { 'data-scrum-delivered': true },
      `${progress.delivered.count}/${progress.total.count} · ${progress.delivered.estimate}/${progress.total.estimate}`,
    ),
    createElement('dt', null, t('dashboard.finished')),
    createElement('dd', null, `${progress.finished.count}/${progress.total.count}`),
    createElement('dt', null, t('backlog.unestimated')),
    createElement('dd', null, String(progress.unestimated)),
  )
}

/**
 * The burndown as three numbers and a bar, not a curve.
 *
 * There is no curve to draw: a sprint records what it committed to when it
 * opened and nothing since, so the days between are not stored. The bar shows
 * how far through the sprint today is against how much work is left, which is
 * the comparison a curve would be read for anyway.
 */
function burndownPanel(burndown: BurndownView, props: DashboardProps): ReactElement {
  const { t } = props
  const scope = props.state.view?.scopeChange ?? null
  return createElement(
    'section',
    { 'data-scrum-burndown': true },
    createElement('h3', null, t('burndown.title')),
    createElement(
      'dl',
      null,
      createElement('dt', null, t('burndown.committed')),
      createElement('dd', { 'data-scrum-committed': true }, String(burndown.committed)),
      createElement('dt', null, t('burndown.remaining')),
      createElement('dd', { 'data-scrum-remaining': true }, String(burndown.remaining)),
      createElement('dt', null, t('burndown.ideal')),
      createElement('dd', { 'data-scrum-ideal': true }, burndown.ideal.toFixed(1)),
      createElement('dt', null, t('burndown.elapsed')),
      createElement('dd', null, `${Math.round(burndown.elapsed * 100)}%`),
    ),
    createElement(
      'div',
      {
        'data-scrum-burndown-bar': true,
        role: 'img',
        'aria-label': `${t('burndown.remaining')} ${burndown.remaining} / ${burndown.committed}`,
      },
      createElement('span', {
        'data-scrum-burndown-remaining': true,
        style: { width: `${percentage(burndown.remaining, burndown.committed)}%` },
      }),
      createElement('span', {
        'data-scrum-burndown-ideal': true,
        style: { left: `${percentage(burndown.ideal, burndown.committed)}%` },
      }),
    ),
    scope === null || (scope.added.length === 0 && scope.removed.length === 0)
      ? null
      : createElement(
          'p',
          { 'data-scrum-scope-change': true },
          `${t('burndown.scope')} · ${t('burndown.scope.added')} ${scope.added.length} · ${t('burndown.scope.removed')} ${scope.removed.length}`,
        ),
    createElement('p', { 'data-scrum-burndown-note': true }, t('burndown.note')),
  )
}

/** Guards a committed total of zero, which a sprint of unsized work has. */
function percentage(value: number, of: number): number {
  if (of <= 0) {
    return value > 0 ? 100 : 0
  }
  return Math.min(100, Math.max(0, (value / of) * 100))
}

function signals(props: DashboardProps): ReactElement {
  const { t } = props
  const groups = props.state.view?.signals ?? []
  return createElement(
    'section',
    { 'data-scrum-signals': true },
    createElement('h3', null, t('dashboard.signals')),
    groups.length === 0
      ? createElement('p', { 'data-scrum-signals-none': true }, t('dashboard.signals.none'))
      : createElement(
          'div',
          null,
          groups.map((group) => signalGroup(group, props)),
        ),
  )
}

function signalGroup(group: SignalGroup, props: DashboardProps): ReactElement {
  const { t } = props
  const copy = SIGNAL_COPY[group.signal]
  return createElement(
    'section',
    { key: group.signal, 'data-scrum-signal': group.signal },
    createElement('h4', null, `${t(copy.title)} ${group.items.length}`),
    createElement('p', null, t(copy.hint)),
    createElement(
      'ul',
      null,
      group.items.map((one) => signalItem(one, props)),
    ),
  )
}

function signalItem(item: WorkItem, props: DashboardProps): ReactElement {
  const { t } = props
  return createElement(
    'li',
    { key: item.id, 'data-scrum-signal-item': item.id },
    createElement('span', null, `${item.id} · ${item.title}`),
    createElement('span', { 'data-scrum-meta': true }, t(typeLabel(item.type))),
    createElement('span', { 'data-scrum-meta': true }, t(statusLabel(item.status))),
  )
}

function activity(props: DashboardProps): ReactElement {
  const { t } = props
  const events = props.state.view?.activity ?? []
  return createElement(
    'section',
    { 'data-scrum-activity': true },
    createElement('h3', null, t('dashboard.activity')),
    props.state.problems.length === 0
      ? null
      : createElement(
          'p',
          { role: 'status', 'data-scrum-activity-problems': props.state.problems.length },
          t('dashboard.activity.problems'),
        ),
    events.length === 0
      ? createElement('p', null, t('dashboard.activity.none'))
      : createElement(
          'ul',
          null,
          events.map((event, index) => activityItem(event, index)),
        ),
  )
}

/**
 * One recorded change, spelled from its own fields.
 *
 * The action is shown as it is stored rather than translated. The vocabulary
 * grows with every use case, and a missing entry would print a key where a
 * sentence belongs; the identifier beside it is what a reader is looking for.
 */
function activityItem(event: ActivityEventView, index: number): ReactElement {
  return createElement(
    'li',
    { key: `${event.at}-${event.targetId}-${index}`, 'data-scrum-activity-item': event.targetId },
    createElement('span', { 'data-scrum-activity-at': true }, day(event.at)),
    createElement('span', { 'data-scrum-activity-action': event.action }, event.action),
    createElement('span', null, event.targetId),
  )
}

/** The date without the time, which is the only part a summary line needs. */
function day(at: string): string {
  return at.slice(0, 'yyyy-mm-dd'.length)
}
