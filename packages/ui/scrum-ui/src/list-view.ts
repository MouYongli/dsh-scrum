import { createElement, type ReactElement } from 'react'
import type { WorkItem } from '@dsh-scrum/scrum-domain'
import type { BacklogState } from './backlog-controller.js'
import {
  LIST_COLUMNS,
  LIST_COLUMN,
  nextSort,
  sortWorkItems,
  type ListColumn,
  type ListSort,
} from './list.js'
import type { Translate } from './messages.js'
import {
  categoryLabel,
  priorityLabel,
  resolutionLabel,
  statusLabel,
  typeLabel,
} from './vocabulary.js'

export interface ListActions {
  readonly sort: (sort: ListSort) => void
  readonly select: (id: WorkItem['id'] | null) => void
  readonly refresh: () => void
}

export interface ListProps {
  readonly state: BacklogState
  readonly sort: ListSort
  readonly t: Translate
  readonly actions: ListActions
}

/**
 * Every work item, every field, in one table.
 *
 * The projection the other views stand on: a board shows one sprint and a
 * backlog shows what is unplanned, and this is the only place somebody can see
 * what a work item actually holds. Nothing here is Scrum-shaped — no sprint
 * scope, no ceremony — because the question it answers is "what is in this
 * project", which is asked outside them.
 */
export function WorkItemList(props: ListProps): ReactElement {
  const { state, t } = props
  if (state.phase === 'loading') {
    return createElement(
      'p',
      { role: 'status', 'data-scrum-list': 'loading' },
      t('backlog.loading'),
    )
  }
  if (state.phase === 'failed') {
    return createElement(
      'div',
      { role: 'alert', 'data-scrum-list': 'failed' },
      createElement('p', null, t('error.title')),
      createElement('p', null, state.failure?.message ?? ''),
    )
  }
  const rows = sortWorkItems(state.ordered, props.sort)
  if (rows.length === 0) {
    return createElement(
      'p',
      { 'data-scrum-list': 'empty' },
      t(state.page.emptiness === 'no-matches' ? 'list.noMatches' : 'list.empty'),
    )
  }
  return createElement(
    'div',
    { 'data-scrum-list': 'items' },
    createElement('p', { 'data-scrum-list-count': true }, `${t('list.count')} ${rows.length}`),
    createElement(
      'table',
      null,
      createElement(
        'thead',
        null,
        createElement(
          'tr',
          null,
          LIST_COLUMNS.map((column) => headerCell(column, props)),
        ),
      ),
      createElement(
        'tbody',
        null,
        rows.map((item) => rowFor(item, props)),
      ),
    ),
  )
}

/**
 * A column heading that sorts.
 *
 * `aria-sort` on the cell rather than a marker inside the button, so a screen
 * reader announces which column the table is ordered by while reading the
 * heading, instead of only when the button happens to be focused.
 */
function headerCell(
  column: { readonly column: ListColumn; readonly label: Parameters<Translate>[0] },
  props: ListProps,
): ReactElement {
  const active = props.sort.column === column.column
  return createElement(
    'th',
    {
      key: column.column,
      scope: 'col',
      'aria-sort': active ? props.sort.direction : 'none',
      'data-scrum-column': column.column,
    },
    createElement(
      'button',
      {
        type: 'button',
        'aria-label': `${props.t(column.label)} — ${props.t('list.sortBy')}`,
        onClick: () => {
          props.actions.sort(nextSort(props.sort, column.column))
        },
      },
      props.t(column.label),
    ),
  )
}

function rowFor(item: WorkItem, props: ListProps): ReactElement {
  const { t } = props
  const selected = props.state.selected?.id === item.id
  return createElement(
    'tr',
    { key: item.id, 'data-scrum-list-row': item.id, 'aria-selected': selected },
    createElement(
      'td',
      { 'data-scrum-column': LIST_COLUMN.id },
      createElement(
        'button',
        {
          type: 'button',
          'aria-pressed': selected,
          onClick: () => {
            props.actions.select(selected ? null : item.id)
          },
        },
        item.id,
      ),
    ),
    createElement('td', { 'data-scrum-column': LIST_COLUMN.title }, item.title),
    createElement('td', { 'data-scrum-column': LIST_COLUMN.type }, t(typeLabel(item.type))),
    createElement(
      'td',
      { 'data-scrum-column': LIST_COLUMN.category },
      t(categoryLabel(item.category)),
    ),
    // The outcome sits with the status, because on a finished item it is the
    // half of "done" that says whether the work was actually delivered.
    createElement(
      'td',
      { 'data-scrum-column': LIST_COLUMN.status },
      item.resolution === null
        ? t(statusLabel(item.status))
        : `${t(statusLabel(item.status))} · ${t(resolutionLabel(item.resolution))}`,
    ),
    createElement(
      'td',
      { 'data-scrum-column': LIST_COLUMN.priority },
      t(priorityLabel(item.priority)),
    ),
    createElement(
      'td',
      { 'data-scrum-column': LIST_COLUMN.assignee },
      item.assigneeId ?? t('list.unassigned'),
    ),
    createElement(
      'td',
      { 'data-scrum-column': LIST_COLUMN.estimate },
      item.estimate === null ? t('backlog.unestimated') : String(item.estimate),
    ),
    createElement(
      'td',
      { 'data-scrum-column': LIST_COLUMN.sprint },
      item.sprintId ?? t('list.noSprint'),
    ),
    createElement('td', { 'data-scrum-column': LIST_COLUMN.updated }, item.updatedAt),
  )
}
