import { createElement, useState, type ReactElement, type ReactNode } from 'react'
import {
  isWorkItemBlocked,
  isWorkItemPlannable,
  type Sprint,
  type SprintId,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import type { BacklogGroup, BacklogRow } from './backlog.js'
import { FilterBar } from './filter-bar.js'
import { READINESS_LABEL, readinessOf } from './readiness.js'
import { LoadingSkeleton } from './skeleton.js'
import { BACKLOG_GROUPING, type BacklogGrouping } from './backlog.js'
import type { BacklogState } from './backlog-controller.js'
import type {
  BlockWorkItem,
  DependWorkItem,
  EditWorkItem,
  NewWorkItem,
  ParentWorkItem,
  RankWorkItem,
  WorkItemRef,
  SetCriterion,
} from './client.js'
import type { MessageKey, Translate } from './messages.js'
import { categoryLabel, priorityLabel, statusLabel, typeLabel } from './vocabulary.js'
import { EMPTY_FIELDS, WorkItemForm, toNewWorkItem } from './work-item-form.js'
import { OrderControls, type RankTarget } from './work-item-links.js'
import type { WorkItemQuery } from './work-item-filter.js'
import { WorkItemDetail } from './work-item-detail.js'

/**
 * What the backlog screen can ask for.
 *
 * One object rather than a dozen optional callbacks: the screen is either
 * wired to a controller or it is not, and a props list where each action can
 * independently be missing invites a control that renders and does nothing.
 */
export interface BacklogActions {
  /** Narrows every view of the work items, not only this one. */
  readonly narrow: (query: WorkItemQuery) => void
  readonly group: (grouping: BacklogGrouping) => void
  readonly select: (id: WorkItemId | null) => void
  readonly refresh: () => void
  readonly dismiss: () => void
  readonly create: (input: NewWorkItem) => void
  readonly edit: (command: EditWorkItem) => void
  readonly criterion: (command: SetCriterion) => void
  readonly rank: (command: RankWorkItem) => void
  readonly parent: (command: ParentWorkItem) => void
  readonly dependency: (command: DependWorkItem) => void
  readonly block: (command: BlockWorkItem) => void
  /** Puts one item into a sprint, or takes it back out with `null`. */
  readonly plan: (item: WorkItemRef, sprintId: SprintId | null) => void
}

export interface BacklogProps {
  readonly state: BacklogState
  /**
   * The filters, which belong to the project surface rather than to this page.
   * Set here they still apply on the work item list, and the other way round.
   */
  readonly query: WorkItemQuery
  readonly actions: BacklogActions
  readonly t: Translate
  /** The sprints that can still take work, for the planning control. */
  readonly openSprints: readonly Sprint[]
  /** The team's own readiness list, shown as the reminder it is. */
  readonly definitionOfReady: readonly string[]
  /**
   * An archived project. The writing controls are not drawn, which is a
   * courtesy and not a check: the host refuses the write either way, and this
   * only spares the user an entry that leads to a refusal.
   */
  readonly readOnly: boolean
}

const GROUPINGS: readonly { readonly value: BacklogGrouping; readonly label: MessageKey }[] = [
  { value: BACKLOG_GROUPING.none, label: 'backlog.grouping.none' },
  { value: BACKLOG_GROUPING.type, label: 'backlog.grouping.type' },
  { value: BACKLOG_GROUPING.category, label: 'backlog.grouping.category' },
  { value: BACKLOG_GROUPING.priority, label: 'backlog.grouping.priority' },
  { value: BACKLOG_GROUPING.parent, label: 'backlog.grouping.parent' },
]

export function BacklogScreen(props: BacklogProps): ReactElement {
  const { state, t } = props
  return createElement(
    'section',
    {
      'data-scrum-backlog': true,
      'aria-label': t('backlog.title'),
      'aria-busy': state.phase === 'loading' || state.busy,
    },
    createElement('h2', null, t('backlog.title')),
    toolbar(props),
    definitionOfReady(props),
    failureBanner(props),
    props.readOnly ? null : createElement(CreatePanel, props),
    body(props),
    detailPanel(props),
  )
}

/**
 * The creation form, folded away until it is asked for.
 *
 * Kept collapsed because the backlog is read far more often than it is added
 * to, and a form permanently occupying the top of the screen pushes the list
 * the user came for below the fold.
 */
function CreatePanel(props: BacklogProps): ReactElement {
  const [open, setOpen] = useState(false)
  if (!open) {
    return createElement(
      'button',
      {
        type: 'button',
        'data-scrum-create-open': true,
        onClick: () => {
          setOpen(true)
        },
      },
      props.t('backlog.create.open'),
    )
  }
  return createElement(
    'div',
    { 'data-scrum-create': true },
    createElement('h3', null, props.t('backlog.create.title')),
    createElement(WorkItemForm, {
      t: props.t,
      id: 'scrum-create',
      initial: EMPTY_FIELDS,
      submitLabel: 'item.create',
      busy: props.state.busy,
      onSubmit: (fields) => {
        setOpen(false)
        props.actions.create(toNewWorkItem(fields))
      },
      onCancel: () => {
        setOpen(false)
      },
    }),
  )
}

/**
 * The detail of the selected item, in the panel both screens share.
 */
function detailPanel(props: BacklogProps): ReactNode {
  const item = props.state.selected
  if (item === null) {
    return null
  }
  return createElement(WorkItemDetail, {
    t: props.t,
    item,
    candidates: props.state.ordered,
    busy: props.state.busy,
    readOnly: props.readOnly,
    actions: {
      close: () => {
        props.actions.select(null)
      },
      edit: props.actions.edit,
      criterion: props.actions.criterion,
      parent: props.actions.parent,
      dependency: props.actions.dependency,
      block: props.actions.block,
    },
  })
}

/**
 * The message above the list.
 *
 * A conflict gets a refresh control and the others do not, because it is the
 * only refusal with a next step: somebody else wrote first, and reading again
 * is what the user needs. The screen never refreshes on its own — that would
 * throw away whatever the user was in the middle of typing.
 */
function failureBanner(props: BacklogProps): ReactElement | null {
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

function toolbar(props: BacklogProps): ReactElement {
  const { state, query, t } = props
  return createElement(
    'div',
    { 'data-scrum-toolbar': true },
    // The narrowing is the shared bar's, so what the user set here is still
    // set on the work item list. Grouping stays: it is a way of drawing this
    // list rather than a way of narrowing it, and no other page has one.
    createElement(FilterBar, {
      query,
      onQuery: props.actions.narrow,
      items: state.ordered,
      t,
      id: 'scrum-backlog',
    }),
    createElement(
      'p',
      null,
      createElement('label', { htmlFor: 'scrum-backlog-grouping' }, t('backlog.grouping.label')),
      createElement(
        'select',
        {
          id: 'scrum-backlog-grouping',
          value: state.grouping,
          onChange: (event: { target: { value: string } }) => {
            props.actions.group(event.target.value as BacklogGrouping)
          },
        },
        GROUPINGS.map((grouping) =>
          createElement(
            'option',
            { key: grouping.value, value: grouping.value },
            t(grouping.label),
          ),
        ),
      ),
    ),
  )
}

/**
 * Spelled out rather than assembled from the state name. A key built by
 * concatenation is a key the compiler cannot check, and the first renamed
 * message would reach a user as the key itself.
 */
const EMPTY_COPY: Readonly<
  Record<'no-items' | 'no-matches', { readonly title: MessageKey; readonly body: MessageKey }>
> = {
  'no-items': { title: 'backlog.empty.title', body: 'backlog.empty.body' },
  'no-matches': { title: 'backlog.noMatches.title', body: 'backlog.noMatches.body' },
}

function body(props: BacklogProps): ReactNode {
  const { state, t } = props
  if (state.phase === 'loading') {
    return createElement(
      'p',
      { 'data-scrum-loading': true },
      t('backlog.loading'),
      createElement(LoadingSkeleton, { rows: 8 }),
    )
  }
  if (state.phase === 'failed') {
    return null
  }
  if (state.page.emptiness !== 'items') {
    const copy = EMPTY_COPY[state.page.emptiness]
    return createElement(
      'div',
      { 'data-scrum-empty': state.page.emptiness },
      createElement('h3', null, t(copy.title)),
      createElement('p', null, t(copy.body)),
    )
  }
  return createElement(
    'div',
    { 'data-scrum-list': true },
    state.page.groups.map((group) => groupSection(group, props)),
  )
}

function groupSection(group: BacklogGroup, props: BacklogProps): ReactElement {
  const { t } = props
  return createElement(
    'section',
    { key: group.key, 'data-scrum-group': group.key },
    createElement(
      'h3',
      null,
      group.label.kind === 'message' ? t(group.label.key) : group.label.text,
    ),
    createElement(
      'p',
      { 'data-scrum-totals': true },
      `${t('backlog.count')} ${group.totals.count} · ${t('backlog.estimate')} ${group.totals.estimate} · ${t('backlog.unestimated')} ${group.totals.unestimated}`,
    ),
    createElement(
      'ul',
      null,
      group.rows.map((row) => rowItem(row, props)),
    ),
  )
}

/**
 * One row is a button, not a clickable div: the detail panel has to open from
 * the keyboard, and a row that only answers a pointer is a row half the users
 * cannot open.
 */
/**
 * The subtasks folded into one row.
 *
 * Drawn inside the parent's row rather than as siblings of it, and without
 * order controls: rank is one order over the things a sprint plans, and a
 * subtask is not one of them. They are still selectable, because a subtask is
 * where somebody records that a piece of the work is blocked or done.
 */
function subtaskList(row: BacklogRow, props: BacklogProps): ReactElement | null {
  if (row.subtasks.length === 0) {
    return null
  }
  const { t } = props
  return createElement(
    'ul',
    { 'data-scrum-subtasks': row.item.id, 'aria-label': t('backlog.subtasks') },
    row.subtasks.map((subtask) =>
      createElement(
        'li',
        { key: subtask.id, 'data-scrum-subtask': subtask.id },
        createElement(
          'button',
          {
            type: 'button',
            'aria-pressed': props.state.selected?.id === subtask.id,
            onClick: () => {
              props.actions.select(props.state.selected?.id === subtask.id ? null : subtask.id)
            },
          },
          `${subtask.id} · ${subtask.title}`,
        ),
        createElement(
          'span',
          { 'data-scrum-status': subtask.status },
          t(statusLabel(subtask.status)),
        ),
        isWorkItemBlocked(subtask)
          ? createElement('span', { 'data-scrum-blocked': true }, t('backlog.blocked'))
          : null,
      ),
    ),
  )
}

function rowItem(row: BacklogRow, props: BacklogProps): ReactElement {
  const { t } = props
  const item: WorkItem = row.item
  const selected = props.state.selected?.id === item.id
  return createElement(
    'li',
    { key: item.id, 'data-scrum-row': item.id },
    createElement(
      'button',
      {
        type: 'button',
        'aria-pressed': selected,
        onClick: () => {
          props.actions.select(selected ? null : item.id)
        },
      },
      `${item.id} · ${item.title}`,
    ),
    createElement('span', { 'data-scrum-type': item.type }, t(typeLabel(item.type))),
    createElement(
      'span',
      { 'data-scrum-category': item.category ?? 'none' },
      t(categoryLabel(item.category)),
    ),
    createElement(
      'span',
      { 'data-scrum-priority': item.priority },
      t(priorityLabel(item.priority)),
    ),
    createElement(
      'span',
      { 'data-scrum-estimate': true },
      item.estimate === null ? t('backlog.unestimated') : String(item.estimate),
    ),
    row.criteria.total === 0
      ? null
      : createElement(
          'span',
          { 'data-scrum-criteria': true },
          `${t('backlog.criteria')} ${row.criteria.satisfied}/${row.criteria.total}`,
        ),
    row.dependencies === 0
      ? null
      : createElement(
          'span',
          { 'data-scrum-dependencies': true },
          `${t('backlog.dependencies')} ${row.dependencies}`,
        ),
    row.blocked
      ? createElement('span', { 'data-scrum-blocked': true }, t('backlog.blocked'))
      : null,
    readinessBadge(item, props),
    props.readOnly ? null : planControl(item, props),
    subtaskList(row, props),
    props.readOnly
      ? null
      : createElement(OrderControls, {
          t,
          ordered: props.state.ordered,
          id: item.id,
          busy: props.state.busy,
          onMove: (target: RankTarget) => {
            props.actions.rank({
              workItemId: item.id,
              expectedRevision: item.revision,
              ...target,
            })
          },
        }),
  )
}

/**
 * How ready an item is, as far as anything here can tell.
 *
 * Advice rather than a gate. A team that decides to take an unready item into
 * a sprint is making a call, and a tool that refused would only teach them to
 * write a placeholder description to get past it.
 *
 * Drawn only where the question applies: an epic is never planned and a
 * subtask rides on its parent.
 */
function readinessBadge(item: WorkItem, props: BacklogProps): ReactElement | null {
  const readiness = readinessOf(item)
  if (readiness === null) {
    return null
  }
  const { t } = props
  if (readiness.ready) {
    return createElement(
      'span',
      { 'data-scrum-readiness': 'ready' },
      `${t('readiness.title')} ${t('readiness.ready')}`,
    )
  }
  return createElement(
    'span',
    {
      'data-scrum-readiness': 'incomplete',
      'data-scrum-readiness-missing': readiness.missing.length,
    },
    `${t('readiness.missing')} ${readiness.missing.map((check) => t(READINESS_LABEL[check])).join('、')}`,
  )
}

/**
 * Puts one item into a sprint without leaving for the sprint page.
 *
 * Only sprints that can still take work are offered, and only for the level a
 * sprint can hold. A closed sprint in the list would be a choice that is
 * always refused.
 */
function planControl(item: WorkItem, props: BacklogProps): ReactElement | null {
  if (!isWorkItemPlannable(item)) {
    return null
  }
  const { t } = props
  const id = `scrum-plan-${item.id}`
  if (props.openSprints.length === 0) {
    return createElement('span', { 'data-scrum-plan-empty': true }, t('backlog.plan.empty'))
  }
  return createElement(
    'span',
    { 'data-scrum-plan-field': true },
    createElement('label', { htmlFor: id }, t('backlog.plan')),
    createElement(
      'select',
      {
        id,
        'data-scrum-plan': item.id,
        value: item.sprintId ?? '',
        disabled: props.state.busy,
        onChange: (event: { target: { value: string } }) => {
          const value = event.target.value
          props.actions.plan(
            { workItemId: item.id, expectedRevision: item.revision },
            value === '' ? null : (value as SprintId),
          )
        },
      },
      createElement('option', { value: '' }, t('backlog.plan.none')),
      props.openSprints.map((sprint) =>
        createElement('option', { key: sprint.id, value: sprint.id }, sprint.name),
      ),
    ),
  )
}

/**
 * The project's own Definition of Ready.
 *
 * Shown once above the list rather than checked per row: these are sentences a
 * team wrote for itself, and nothing here can evaluate one. Ticking them
 * automatically would be claiming to have verified something nobody verified.
 */
function definitionOfReady(props: BacklogProps): ReactElement | null {
  if (props.definitionOfReady.length === 0) {
    return null
  }
  const { t } = props
  return createElement(
    'section',
    { 'data-scrum-definition-of-ready': props.definitionOfReady.length },
    createElement('h4', null, t('readiness.definition')),
    createElement('p', null, t('readiness.definition.hint')),
    createElement(
      'ul',
      null,
      props.definitionOfReady.map((entry) => createElement('li', { key: entry }, entry)),
    ),
  )
}
