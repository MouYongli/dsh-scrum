import { createElement, useState, type ReactElement, type ReactNode } from 'react'
import type { WorkItem, WorkItemId } from '@dsh-scrum/scrum-domain'
import type { BacklogGroup, BacklogRow } from './backlog.js'
import { BACKLOG_GROUPING, type BacklogGrouping } from './backlog.js'
import type { BacklogState } from './backlog-controller.js'
import type {
  BacklogQuery,
  BlockWorkItem,
  DependWorkItem,
  EditWorkItem,
  NewWorkItem,
  ParentWorkItem,
  RankWorkItem,
  SetCriterion,
} from './client.js'
import type { MessageKey, Translate } from './messages.js'
import { priorityLabel, typeLabel } from './vocabulary.js'
import { EMPTY_FIELDS, WorkItemForm, toNewWorkItem } from './work-item-form.js'
import { OrderControls, type RankTarget } from './work-item-links.js'
import { WorkItemDetail } from './work-item-detail.js'

/**
 * What the backlog screen can ask for.
 *
 * One object rather than a dozen optional callbacks: the screen is either
 * wired to a controller or it is not, and a props list where each action can
 * independently be missing invites a control that renders and does nothing.
 */
export interface BacklogActions {
  readonly query: (query: BacklogQuery) => void
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
}

export interface BacklogProps {
  readonly state: BacklogState
  readonly actions: BacklogActions
  readonly t: Translate
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
  const { state, t } = props
  const query = state.query
  return createElement(
    'div',
    { 'data-scrum-toolbar': true },
    createElement(
      'p',
      null,
      createElement('label', { htmlFor: 'scrum-backlog-text' }, t('backlog.filter.text')),
      createElement('input', {
        id: 'scrum-backlog-text',
        type: 'search',
        value: query.text ?? '',
        onChange: (event: { target: { value: string } }) => {
          props.actions.query({ ...query, text: event.target.value })
        },
      }),
    ),
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
    checkbox('scrum-backlog-blocked', t('backlog.filter.blocked'), query.blocked === true, (on) => {
      props.actions.query(on ? { ...query, blocked: true } : without(query, 'blocked'))
    }),
    checkbox(
      'scrum-backlog-planned',
      t('backlog.filter.planned'),
      query.sprintId === undefined,
      (on) => {
        props.actions.query(on ? without(query, 'sprintId') : { ...query, sprintId: null })
      },
    ),
  )
}

/**
 * Drops one narrowing.
 *
 * Dropping means clearing the field, not setting it to `false` or `null`: both
 * of those already mean something else here — "only the unblocked ones" and
 * "only the unplanned ones" — and neither is what an unticked box says.
 */
function without(query: BacklogQuery, key: 'blocked' | 'sprintId'): BacklogQuery {
  return {
    text: query.text,
    types: query.types,
    priorities: query.priorities,
    labels: query.labels,
    blocked: key === 'blocked' ? undefined : query.blocked,
    sprintId: key === 'sprintId' ? undefined : query.sprintId,
  }
}

function checkbox(
  id: string,
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): ReactElement {
  return createElement(
    'p',
    { key: id },
    createElement('input', {
      id,
      type: 'checkbox',
      checked,
      onChange: (event: { target: { checked: boolean } }) => {
        onChange(event.target.checked)
      },
    }),
    createElement('label', { htmlFor: id }, label),
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
    return createElement('p', { 'data-scrum-loading': true }, t('backlog.loading'))
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
