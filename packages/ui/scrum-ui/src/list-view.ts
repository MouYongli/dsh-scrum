import { createElement, type ReactElement } from 'react'
import type { Sprint, WorkItem, WorkItemId } from '@dsh-scrum/scrum-domain'
import type { BacklogState } from './backlog-controller.js'
import { BATCH_FIELD, isFinishingMove, type BatchChange, type BatchOutcome } from './batch.js'
import { everyMoveTarget } from './board.js'
import { LoadingSkeleton } from './skeleton.js'
import {
  LIST_COLUMNS,
  LIST_COLUMN,
  nextSort,
  sortWorkItems,
  type ListColumn,
  type ListSort,
} from './list.js'
import type { MessageKey, Translate } from './messages.js'
import {
  PRIORITIES,
  categoryLabel,
  priorityLabel,
  priorityTone,
  resolutionLabel,
  statusLabel,
  statusTone,
  typeLabel,
  type Tone,
} from './vocabulary.js'

export interface ListActions {
  readonly sort: (sort: ListSort) => void
  readonly select: (id: WorkItem['id'] | null) => void
  readonly refresh: () => void
  /** Which rows the batch panel acts on. */
  readonly mark: (ids: readonly WorkItemId[]) => void
  readonly apply: (change: BatchChange) => void
  readonly exportRows: (rows: readonly WorkItem[]) => void
}

export interface ListProps {
  readonly state: BacklogState
  readonly sort: ListSort
  readonly t: Translate
  readonly actions: ListActions
  /** The rows the batch acts on, held by the page rather than by the table. */
  readonly marked: readonly WorkItemId[]
  /** What the last batch did, until the next one replaces it. */
  readonly outcome: BatchOutcome | null
  /** The sprints a selection may be planned into. */
  readonly sprints: readonly Sprint[]
  readonly readOnly: boolean
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
      createElement(LoadingSkeleton, { rows: 8 }),
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
    createElement(
      'div',
      { 'data-scrum-list-bar': true },
      createElement('p', { 'data-scrum-list-count': true }, `${t('list.count')} ${rows.length}`),
      /*
       * How to begin, while beginning is still the next thing to do. Once
       * rows are marked the form below says what is marked, and a toolbar
       * still explaining how to mark them would be arguing with it.
       */
      props.readOnly || markedIn(rows, props).length > 0
        ? null
        : createElement('p', { 'data-scrum-list-hint': true }, t('list.batch.hint')),
      props.readOnly
        ? null
        : createElement(
            'button',
            {
              type: 'button',
              'data-scrum-export': true,
              onClick: () => {
                props.actions.exportRows(rows)
              },
            },
            t('list.export'),
          ),
    ),
    props.readOnly ? null : batchPanel(rows, props),
    outcomePanel(props),
    createElement(
      'table',
      null,
      createElement(
        'thead',
        null,
        createElement(
          'tr',
          null,
          props.readOnly ? null : selectAllCell(rows, props),
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
  const marked = props.marked.includes(item.id)
  return createElement(
    'tr',
    { key: item.id, 'data-scrum-list-row': item.id, 'aria-selected': selected },
    props.readOnly
      ? null
      : createElement(
          'td',
          { 'data-scrum-column': 'mark' },
          createElement('input', {
            type: 'checkbox',
            'data-scrum-mark': item.id,
            'aria-label': `${t('list.mark')} ${item.id}`,
            checked: marked,
            onChange: () => {
              props.actions.mark(
                marked ? props.marked.filter((one) => one !== item.id) : [...props.marked, item.id],
              )
            },
          }),
        ),
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
    // half of "done" that says whether the work was actually delivered. The
    // status is what carries the tone; the outcome trails it quietly, since
    // two coloured words in one cell would be two things asking to be read
    // first.
    createElement(
      'td',
      { 'data-scrum-column': LIST_COLUMN.status },
      badge(t(statusLabel(item.status)), statusTone(item.status)),
      item.resolution === null
        ? null
        : createElement(
            'span',
            { 'data-scrum-outcome': true },
            ` · ${t(resolutionLabel(item.resolution))}`,
          ),
    ),
    createElement(
      'td',
      { 'data-scrum-column': LIST_COLUMN.priority },
      badge(t(priorityLabel(item.priority)), priorityTone(item.priority)),
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

/**
 * The box that selects every row, and only the rows on screen.
 *
 * Narrowing is what makes a batch safe to reason about: "all" has to mean the
 * rows the user is looking at, never everything the project holds.
 */
function selectAllCell(rows: readonly WorkItem[], props: ListProps): ReactElement {
  const all = rows.length > 0 && rows.every((item) => props.marked.includes(item.id))
  return createElement(
    'th',
    { scope: 'col', 'data-scrum-column': 'mark' },
    createElement('input', {
      type: 'checkbox',
      'data-scrum-mark-all': true,
      'aria-label': props.t('list.markAll'),
      checked: all,
      onChange: () => {
        props.actions.mark(all ? [] : rows.map((item) => item.id))
      },
    }),
  )
}

/**
 * One submitted select, as a string.
 *
 * A form entry is a string or a file, and only the selects in this form are
 * ever read; anything else is a control that does not belong here rather than
 * a value worth guessing at.
 */
function chosen(form: FormData, name: string): string {
  const entry = form.get(name)
  return typeof entry === 'string' ? entry : ''
}

/** The fields a batch can set, and where each one's choices come from. */
const BATCH_FIELDS: readonly { readonly field: string; readonly label: MessageKey }[] = [
  { field: BATCH_FIELD.status, label: 'list.batch.status' },
  { field: BATCH_FIELD.priority, label: 'list.batch.priority' },
  { field: BATCH_FIELD.sprint, label: 'list.batch.sprint' },
  { field: BATCH_FIELD.assignee, label: 'list.batch.assignee' },
  { field: BATCH_FIELD.addLabel, label: 'list.batch.addLabel' },
  { field: BATCH_FIELD.removeLabel, label: 'list.batch.removeLabel' },
]

/**
 * One change, applied to what is marked.
 *
 * A form rather than a menu of one-click actions: a batch is the operation
 * most worth being deliberate about, and a submit gives the user the moment
 * before it in which to notice they marked the wrong twenty rows.
 */
/**
 * A value that is worth telling apart at a glance.
 *
 * The word stays: colour is the second channel and never the only one, so the
 * cell reads the same to somebody who cannot separate the tones and to
 * anybody reading it in a CSV.
 */
function badge(text: string, tone: Tone): ReactElement {
  return createElement('span', { 'data-scrum-badge': tone }, text)
}

/** What is marked and still on screen; a filtered-out mark is not in play. */
function markedIn(rows: readonly WorkItem[], props: ListProps): readonly WorkItem[] {
  return rows.filter((item) => props.marked.includes(item.id))
}

function batchPanel(rows: readonly WorkItem[], props: ListProps): ReactElement | null {
  const { t } = props
  const marked = markedIn(rows, props)
  /*
   * Nothing marked draws nothing. The panel used to stand there saying how to
   * begin, which is a sentence that is read once and then occupies a row of
   * every screen after it; the toolbar carries that line now, and this space
   * belongs to the form only while there is something for it to change.
   */
  if (marked.length === 0) {
    return null
  }
  return createElement(
    'form',
    {
      'data-scrum-batch': 'open',
      onSubmit: (event: { preventDefault: () => void; currentTarget: HTMLFormElement }) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const field = chosen(form, 'field')
        props.actions.apply({
          field: field as BatchChange['field'],
          value: chosen(form, `value-${field}`),
        })
      },
    },
    createElement(
      'p',
      { 'data-scrum-batch-count': marked.length },
      `${t('list.batch.selected')} ${marked.length}`,
    ),
    createElement('label', { htmlFor: 'scrum-batch-field' }, t('list.batch.field')),
    createElement(
      'select',
      { id: 'scrum-batch-field', name: 'field', defaultValue: BATCH_FIELD.status },
      BATCH_FIELDS.map((entry) =>
        createElement('option', { key: entry.field, value: entry.field }, t(entry.label)),
      ),
    ),
    // Every field's control is rendered and named apart, so the form reads
    // back exactly the one the chosen field owns. A single control that
    // changed meaning would send a priority where a status was expected the
    // moment the two got out of step.
    BATCH_FIELDS.map((entry) => batchValue(entry.field, rows, props)),
    createElement(
      'button',
      { type: 'submit', 'data-scrum-batch-apply': true, disabled: props.state.busy },
      t('list.batch.apply'),
    ),
  )
}

function batchValue(field: string, rows: readonly WorkItem[], props: ListProps): ReactElement {
  const { t } = props
  const id = `scrum-batch-value-${field}`
  const name = `value-${field}`
  const options = ((): readonly { readonly value: string; readonly label: string }[] => {
    switch (field) {
      case BATCH_FIELD.status:
        return everyMoveTarget().map((target) => ({
          value: target.key,
          label: isFinishingMove(target.key)
            ? `${t(statusLabel(target.status))} · ${t(target.label)}`
            : t(statusLabel(target.status)),
        }))
      case BATCH_FIELD.priority:
        return PRIORITIES.map((priority) => ({
          value: priority,
          label: t(priorityLabel(priority)),
        }))
      case BATCH_FIELD.sprint:
        return [
          { value: '', label: t('list.batch.backlog') },
          ...props.sprints.map((sprint) => ({ value: sprint.id, label: sprint.name })),
        ]
      case BATCH_FIELD.assignee:
        return [
          { value: '', label: t('filter.assignee.none') },
          ...[
            ...new Set(
              rows
                .map((item) => item.assigneeId)
                .filter((one): one is NonNullable<typeof one> => one !== null),
            ),
          ].map((one) => ({ value: one, label: one })),
        ]
      default:
        return [...new Set(rows.flatMap((item) => item.labels))]
          .sort()
          .map((label) => ({ value: label, label }))
    }
  })()
  return createElement(
    'p',
    { key: field, 'data-scrum-batch-value': field },
    createElement('label', { htmlFor: id }, t('list.batch.value')),
    createElement(
      'select',
      { id, name },
      options.map((option) =>
        createElement('option', { key: option.value, value: option.value }, option.label),
      ),
    ),
  )
}

/**
 * What the last batch did.
 *
 * Written as two counts rather than one verdict. A batch is not a transaction,
 * so "it failed" would describe a state the store is not in when eighteen of
 * twenty rows were written.
 */
function outcomePanel(props: ListProps): ReactElement | null {
  const outcome = props.outcome
  if (outcome === null) {
    return null
  }
  const { t } = props
  return createElement(
    'div',
    {
      role: 'status',
      'data-scrum-batch-outcome': true,
      'data-scrum-batch-written': outcome.written.length,
      'data-scrum-batch-refused': outcome.refused.length,
    },
    createElement('p', null, `${t('list.batch.written')} ${outcome.written.length}`),
    outcome.refused.length === 0
      ? null
      : createElement(
          'div',
          null,
          createElement('p', null, `${t('list.batch.refused')} ${outcome.refused.length}`),
          createElement(
            'ul',
            null,
            outcome.refused.map((one) =>
              createElement(
                'li',
                { key: one.id, 'data-scrum-batch-refusal': one.id },
                `${one.id} · ${one.failure.message}`,
              ),
            ),
          ),
        ),
  )
}
