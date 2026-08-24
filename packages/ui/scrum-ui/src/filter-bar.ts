import { createElement, type ReactElement } from 'react'
import {
  WORK_ITEM_LEVEL,
  WORK_ITEM_TYPE,
  type IdentityId,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import { FilterMultiSelect } from './filter-multi-select.js'
import type { MessageKey, Translate } from './messages.js'
import {
  BOARD_COLUMNS,
  PRIORITIES,
  WORK_ITEM_CATEGORIES,
  WORK_ITEM_TYPES,
  categoryLabel,
  priorityLabel,
  statusLabel,
  typeLabel,
} from './vocabulary.js'
import { isNarrowed, type WorkItemQuery } from './work-item-filter.js'

export interface FilterBarProps {
  readonly query: WorkItemQuery
  readonly onQuery: (query: WorkItemQuery) => void
  /**
   * What was loaded, which is where the epic, assignee and label choices come
   * from. Offering an epic the project does not have would be offering a
   * filter that can only ever return nothing.
   */
  readonly items: readonly WorkItem[]
  readonly t: Translate
  /** Prefix for the control ids, so two bars on one page stay distinguishable. */
  readonly id: string
}

/**
 * The one place a work item query is set.
 *
 * The sprint is deliberately not here. It is each page's own definition of
 * what it shows — a backlog is the work in no sprint, a board is one sprint's
 * — and a sprint carried between pages would mean narrowing the list and
 * finding the backlog had stopped being a backlog.
 */
export function FilterBar(props: FilterBarProps): ReactElement {
  const { t, query } = props
  return createElement(
    'div',
    { 'data-scrum-filter-bar': true, role: 'group', 'aria-label': t('filter.title') },
    text(props),
    multi(props, 'type', 'filter.type', WORK_ITEM_TYPES, typeLabel, query.types, (types) => {
      props.onQuery({ ...query, types })
    }),
    multi(
      props,
      'category',
      'filter.category',
      WORK_ITEM_CATEGORIES,
      categoryLabel,
      query.categories,
      (categories) => {
        props.onQuery({ ...query, categories })
      },
    ),
    multi(
      props,
      'status',
      'filter.status',
      BOARD_COLUMNS,
      statusLabel,
      query.statuses,
      (statuses) => {
        props.onQuery({ ...query, statuses })
      },
    ),
    multi(
      props,
      'priority',
      'filter.priority',
      PRIORITIES,
      priorityLabel,
      query.priorities,
      (priorities) => {
        props.onQuery({ ...query, priorities })
      },
    ),
    epic(props),
    assignee(props),
    labels(props),
    blocked(props),
    clear(props),
  )
}

function control(id: string, label: string, field: ReactElement): ReactElement {
  return createElement(
    'p',
    { key: id, 'data-scrum-filter-field': true },
    createElement('label', { htmlFor: id }, label),
    field,
  )
}

function text(props: FilterBarProps): ReactElement {
  const id = `${props.id}-text`
  return control(
    id,
    props.t('filter.text'),
    createElement('input', {
      id,
      type: 'search',
      'data-scrum-filter': 'text',
      value: props.query.text,
      onChange: (event: { target: { value: string } }) => {
        props.onQuery({ ...props.query, text: event.target.value })
      },
    }),
  )
}

/**
 * One dimension with several values wanted at once.
 *
 * The bar keeps the message keys and the component keeps the interaction, so
 * the five dimensions differ here only by what they are a list of.
 */
function multi<Value extends string>(
  props: FilterBarProps,
  name: string,
  label: MessageKey,
  values: readonly Value[],
  labelOf: (value: Value) => MessageKey,
  selected: readonly Value[],
  onChange: (values: readonly Value[]) => void,
): ReactElement {
  return createElement(FilterMultiSelect<Value>, {
    key: name,
    id: `${props.id}-${name}`,
    name,
    label: props.t(label),
    values,
    labelOf: (value: Value) => props.t(labelOf(value)),
    selected,
    onChange,
    t: props.t,
  })
}

/** The epics that were loaded, which is what "under this epic" can mean here. */
function epic(props: FilterBarProps): ReactElement {
  const id = `${props.id}-epic`
  const epics = props.items.filter((item) => item.level === WORK_ITEM_LEVEL[WORK_ITEM_TYPE.epic])
  return control(
    id,
    props.t('filter.epic'),
    createElement(
      'select',
      {
        id,
        'data-scrum-filter': 'epic',
        value: props.query.epicId ?? '',
        onChange: (event: { target: { value: string } }) => {
          const value = event.target.value
          props.onQuery({
            ...props.query,
            epicId: value === '' ? undefined : (value as WorkItemId),
          })
        },
      },
      createElement('option', { value: '' }, props.t('filter.epic.any')),
      epics.map((one) =>
        createElement('option', { key: one.id, value: one.id }, `${one.id} · ${one.title}`),
      ),
    ),
  )
}

/**
 * Three answers, and the third is not the absence of a filter: anybody's work,
 * one person's, and the work nobody has picked up.
 */
function assignee(props: FilterBarProps): ReactElement {
  const id = `${props.id}-assignee`
  const people = [
    ...new Set(
      props.items.map((item) => item.assigneeId).filter((one): one is IdentityId => one !== null),
    ),
  ]
  return control(
    id,
    props.t('filter.assignee'),
    createElement(
      'select',
      {
        id,
        'data-scrum-filter': 'assignee',
        value: props.query.assigneeId === undefined ? '' : (props.query.assigneeId ?? 'none'),
        onChange: (event: { target: { value: string } }) => {
          const value = event.target.value
          props.onQuery({
            ...props.query,
            assigneeId: value === '' ? undefined : value === 'none' ? null : (value as IdentityId),
          })
        },
      },
      createElement('option', { value: '' }, props.t('filter.assignee.any')),
      createElement('option', { value: 'none' }, props.t('filter.assignee.none')),
      people.map((one) => createElement('option', { key: one, value: one }, one)),
    ),
  )
}

function labels(props: FilterBarProps): ReactElement | null {
  const known = [...new Set(props.items.flatMap((item) => item.labels))].sort()
  // Labels are free text, so a project that uses none has nothing to offer and
  // an empty control would be one that cannot do anything.
  if (known.length === 0) {
    return null
  }
  return createElement(FilterMultiSelect<string>, {
    id: `${props.id}-labels`,
    name: 'labels',
    label: props.t('filter.label'),
    values: known,
    labelOf: (one: string) => one,
    selected: props.query.labels,
    onChange: (chosen) => {
      props.onQuery({ ...props.query, labels: chosen })
    },
    t: props.t,
  })
}

/**
 * Absent asks for everything; `false` asks for the items explicitly not
 * blocked. Turning the box off has to clear the field rather than set it.
 */
function blocked(props: FilterBarProps): ReactElement {
  const id = `${props.id}-blocked`
  return createElement(
    'p',
    { key: id, 'data-scrum-filter-field': true },
    createElement('input', {
      id,
      type: 'checkbox',
      'data-scrum-filter': 'blocked',
      checked: props.query.blocked === true,
      onChange: (event: { target: { checked: boolean } }) => {
        props.onQuery({
          ...props.query,
          blocked: event.target.checked ? true : undefined,
        })
      },
    }),
    createElement('label', { htmlFor: id }, props.t('filter.blocked')),
  )
}

/** Only offered once there is something to clear. */
function clear(props: FilterBarProps): ReactElement | null {
  if (!isNarrowed(props.query)) {
    return createElement('p', { 'data-scrum-filter-none': true }, props.t('filter.none'))
  }
  return createElement(
    'button',
    {
      type: 'button',
      'data-scrum-filter-clear': true,
      onClick: () => {
        props.onQuery({
          text: '',
          types: [],
          categories: [],
          statuses: [],
          priorities: [],
          labels: [],
        })
      },
    },
    props.t('filter.clear'),
  )
}
