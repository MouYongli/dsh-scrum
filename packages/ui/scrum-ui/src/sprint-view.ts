import { createElement, useState, type ReactElement, type ReactNode } from 'react'
import type { Sprint, SprintId, WorkItem } from '@dsh-scrum/scrum-domain'
import { SPRINT_STATUS } from '@dsh-scrum/scrum-domain'
import { Board, type BoardActions } from './board-view.js'
import type { Disposition, NewSprint, WorkItemRef } from './client.js'
import { WorkItemDetail, type WorkItemDetailActions } from './work-item-detail.js'
import type { SprintState } from './sprint-controller.js'
import type { MessageKey, Translate } from './messages.js'
import { SprintConfirmDialog } from './sprint-confirm.js'
import { SprintForm, toDay } from './sprint-form.js'
import { priorityLabel, sprintStatusLabel, typeLabel } from './vocabulary.js'

/** What the sprint screen can ask for. See `BacklogActions` for the reasoning. */
export interface SprintActions extends BoardActions, Omit<WorkItemDetailActions, 'close'> {
  readonly select: (sprintId: SprintId) => void
  readonly create: (input: NewSprint) => void
  readonly plan: (items: readonly WorkItemRef[], into: SprintId | null) => void
  readonly refresh: () => void
  readonly dismiss: () => void
  readonly ask: (kind: 'start' | 'close') => void
  readonly cancel: () => void
  readonly start: () => void
  readonly close: (resultSummary: string, dispositions: readonly Disposition[]) => void
}

export interface SprintProps {
  readonly state: SprintState
  readonly actions: SprintActions
  readonly t: Translate
  readonly readOnly: boolean
}

export function SprintScreen(props: SprintProps): ReactElement {
  const { state, t } = props
  return createElement(
    'section',
    {
      'data-scrum-sprints': true,
      'aria-label': t('sprint.title'),
      'aria-busy': state.phase === 'loading' || state.busy,
    },
    createElement('h2', null, t('sprint.title')),
    failureBanner(props),
    state.phase === 'loading'
      ? createElement('p', { 'data-scrum-loading': true }, t('sprint.loading'))
      : state.phase === 'failed'
        ? null
        : createElement(
            'div',
            { 'data-scrum-sprint-body': true },
            sprintPicker(props),
            props.readOnly ? null : createElement(CreatePanel, props),
            state.selected === null ? emptyState(props) : summary(state.selected, props),
            state.confirmation === null ? null : confirmation(props),
            state.selected === null ? null : transitions(state.selected, props),
            state.selected === null ? null : board(props),
            state.selected === null ? null : planning(state.selected, props),
            drawer(props),
          ),
  )
}

function confirmation(props: SprintProps): ReactNode {
  if (props.state.confirmation === null) {
    return null
  }
  return createElement(SprintConfirmDialog, {
    confirmation: props.state.confirmation,
    sprints: props.state.sprints,
    t: props.t,
    busy: props.state.busy,
    onCancel: props.actions.cancel,
    onStart: props.actions.start,
    onClose: props.actions.close,
  })
}

/**
 * The one transition this sprint has left.
 *
 * Only the transition its status allows is offered. A start control on an
 * active sprint would be a control whose only outcome is a refusal, and the
 * user would have to click it to find that out.
 */
function transitions(sprint: Sprint, props: SprintProps): ReactNode {
  if (props.readOnly || sprint.status === SPRINT_STATUS.closed) {
    return null
  }
  const kind = sprint.status === SPRINT_STATUS.planned ? 'start' : 'close'
  return createElement(
    'button',
    {
      type: 'button',
      disabled: props.state.busy,
      'data-scrum-transition': kind,
      onClick: () => {
        props.actions.ask(kind)
      },
    },
    props.t(kind === 'start' ? 'sprint.start' : 'sprint.close'),
  )
}

function board(props: SprintProps): ReactElement {
  return createElement(Board, {
    board: props.state.board,
    actions: props.actions,
    t: props.t,
    busy: props.state.busy,
    readOnly: props.readOnly,
  })
}

/**
 * The drawer, over the same panel the backlog shows. One work item looks the
 * same wherever it is opened from.
 */
function drawer(props: SprintProps): ReactNode {
  const item = props.state.detail
  if (item === null) {
    return null
  }
  return createElement(WorkItemDetail, {
    t: props.t,
    item,
    candidates: props.state.unplanned,
    busy: props.state.busy,
    readOnly: props.readOnly,
    actions: {
      close: () => {
        props.actions.detail(null)
      },
      edit: props.actions.edit,
      criterion: props.actions.criterion,
      parent: props.actions.parent,
      dependency: props.actions.dependency,
      block: props.actions.block,
    },
  })
}

function failureBanner(props: SprintProps): ReactNode {
  const { failure } = props.state
  if (failure === null) {
    return null
  }
  const conflict = failure.kind === 'conflict'
  return createElement(
    'div',
    { role: 'alert', 'data-scrum-failure': failure.kind },
    createElement('p', null, props.t(conflict ? 'backlog.conflict.title' : 'error.title')),
    createElement('p', null, conflict ? props.t('backlog.conflict.body') : failure.message),
    conflict
      ? createElement(
          'button',
          { type: 'button', onClick: props.actions.refresh, 'data-scrum-refresh': true },
          props.t('backlog.conflict.refresh'),
        )
      : null,
    createElement(
      'button',
      { type: 'button', onClick: props.actions.dismiss, 'data-scrum-dismiss': true },
      props.t('backlog.dismiss'),
    ),
  )
}

/**
 * Which sprint the screen is on.
 *
 * A list of buttons rather than a dropdown: the status of every sprint is part
 * of what the user is choosing between, and a dropdown would show it only for
 * the one already chosen.
 */
function sprintPicker(props: SprintProps): ReactElement {
  const { t } = props
  return createElement(
    'ul',
    { 'data-scrum-sprint-picker': true },
    props.state.sprints.map((sprint) =>
      createElement(
        'li',
        { key: sprint.id },
        createElement(
          'button',
          {
            type: 'button',
            'aria-pressed': props.state.selected?.id === sprint.id,
            'data-scrum-sprint': sprint.id,
            onClick: () => {
              props.actions.select(sprint.id)
            },
          },
          `${sprint.name} · ${t(sprintStatusLabel(sprint.status))}`,
        ),
      ),
    ),
  )
}

function emptyState(props: SprintProps): ReactElement {
  return createElement(
    'div',
    { 'data-scrum-empty': 'no-sprints' },
    createElement('h3', null, props.t('sprint.empty.title')),
    createElement('p', null, props.t('sprint.empty.body')),
  )
}

function CreatePanel(props: SprintProps): ReactElement {
  const [open, setOpen] = useState(false)
  if (!open) {
    return createElement(
      'button',
      {
        type: 'button',
        'data-scrum-sprint-create-open': true,
        onClick: () => {
          setOpen(true)
        },
      },
      props.t('sprint.create.open'),
    )
  }
  return createElement(SprintForm, {
    t: props.t,
    busy: props.state.busy,
    onSubmit: (input) => {
      setOpen(false)
      props.actions.create(input)
    },
    onCancel: () => {
      setOpen(false)
    },
  })
}

/**
 * The sprint's goal, its dates and where its work stands.
 *
 * The planned dates are shown rather than the actual timestamps: they are what
 * the team agreed to, and a summary that quietly swapped in when the sprint
 * really opened would be answering a different question than the one asked.
 */
function summary(sprint: Sprint, props: SprintProps): ReactElement {
  const { t, state } = props
  return createElement(
    'div',
    { 'data-scrum-sprint-summary': sprint.id },
    createElement('h3', null, sprint.name),
    createElement(
      'p',
      { 'data-scrum-sprint-dates': true },
      `${toDay(sprint.startDate)} — ${toDay(sprint.endDate)} · ${t(sprintStatusLabel(sprint.status))}`,
    ),
    sprint.goal === '' ? null : createElement('p', { 'data-scrum-sprint-goal': true }, sprint.goal),
    createElement(
      'p',
      { 'data-scrum-sprint-progress': true },
      `${t('sprint.progress.done')} ${state.board.finished.count}/${state.board.total.count} · ` +
        `${t('backlog.estimate')} ${state.board.finished.estimate}/${state.board.total.estimate} · ` +
        `${t('backlog.unestimated')} ${state.board.total.unestimated}`,
    ),
  )
}

/**
 * The planning pane: what is in the sprint, and what could be.
 *
 * Planning one item at a time rather than through a multi-selection. The write
 * carries each item's revision, so a batch would either refuse wholesale
 * because one row moved or need a rule for partially applying, and neither is
 * something the user asked for when they clicked one item.
 */
function planning(sprint: Sprint, props: SprintProps): ReactElement {
  const { t } = props
  const closed = sprint.status === SPRINT_STATUS.closed
  const inSprint = props.state.board.columns.flatMap((column) =>
    column.cards.map((card) => card.item),
  )
  return createElement(
    'div',
    { 'data-scrum-planning': sprint.id },
    pane(
      'scrum-planned',
      'sprint.planned',
      inSprint,
      props,
      props.readOnly || closed ? null : { label: 'sprint.remove', into: null },
    ),
    pane(
      'scrum-unplanned',
      'sprint.unplanned',
      props.state.unplanned,
      props,
      props.readOnly || closed ? null : { label: 'sprint.add', into: sprint.id },
    ),
    closed
      ? createElement('p', { 'data-scrum-sprint-closed': true }, t('sprint.closedNotice'))
      : null,
  )
}

function pane(
  id: string,
  heading: MessageKey,
  items: readonly WorkItem[],
  props: SprintProps,
  action: { readonly label: MessageKey; readonly into: SprintId | null } | null,
): ReactElement {
  const { t } = props
  return createElement(
    'section',
    { 'data-scrum-pane': id },
    createElement('h4', null, `${t(heading)} (${items.length})`),
    items.length === 0
      ? createElement('p', null, t('sprint.pane.empty'))
      : createElement(
          'ul',
          null,
          items.map((item) =>
            createElement(
              'li',
              { key: item.id, 'data-scrum-row': item.id },
              createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => {
                    props.actions.detail(item.id)
                  },
                },
                `${item.id} · ${item.title}`,
              ),
              createElement('span', null, t(typeLabel(item.type))),
              createElement('span', null, t(priorityLabel(item.priority))),
              action === null
                ? null
                : createElement(
                    'button',
                    {
                      type: 'button',
                      disabled: props.state.busy,
                      'data-scrum-plan': action.into ?? 'backlog',
                      onClick: () => {
                        props.actions.plan(
                          [{ workItemId: item.id, expectedRevision: item.revision }],
                          action.into,
                        )
                      },
                    },
                    t(action.label),
                  ),
            ),
          ),
        ),
  )
}
