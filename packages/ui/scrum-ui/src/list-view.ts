import { createElement, useState, type ReactElement } from 'react'
import {
  WORK_ITEM_RESOLUTION,
  WORK_ITEM_STATUS,
  type Sprint,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import type { BacklogState } from './backlog-controller.js'
import { BATCH_FIELD, isFinishingMove, type BatchChange, type BatchOutcome } from './batch.js'
import { everyMoveTarget } from './board.js'
import { LoadingSkeleton } from './skeleton.js'
import { LIST_COLUMN, nextSort, sortWorkItems, type ListColumn, type ListSort } from './list.js'
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

const OPTIONAL_COLUMNS: readonly { readonly column: ListColumn; readonly label: MessageKey }[] = [
  { column: LIST_COLUMN.title, label: 'list.column.title' },
  { column: LIST_COLUMN.status, label: 'list.column.status' },
  { column: LIST_COLUMN.priority, label: 'item.priority' },
  { column: LIST_COLUMN.assignee, label: 'list.column.assignee' },
  { column: LIST_COLUMN.estimate, label: 'item.estimate' },
  { column: LIST_COLUMN.sprint, label: 'list.column.sprint' },
  { column: LIST_COLUMN.updated, label: 'list.column.updated' },
]

export interface ListActions {
  readonly sort: (sort: ListSort) => void
  readonly select: (id: WorkItem['id'] | null) => void
  readonly refresh: () => void
  /** Which rows the batch panel acts on. */
  readonly mark: (ids: readonly WorkItemId[]) => void
  readonly apply: (change: BatchChange) => void
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
  const [expanded, setExpanded] = useState<readonly WorkItemId[]>([])
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
  const columns = visibleColumns(rows, props.sort)
  const tree = hierarchicalRows(rows, props.sort, expanded)
  const drawnItems = tree.map(({ item }) => item)
  return createElement(
    'div',
    { 'data-scrum-list': 'items' },
    props.readOnly ? null : batchPanel(drawnItems, props),
    outcomePanel(props),
    createElement(
      'div',
      { 'data-scrum-table-scroll': true },
      createElement(
        'table',
        { 'aria-label': t('items.title') },
        createElement(
          'thead',
          null,
          createElement(
            'tr',
            null,
            props.readOnly ? null : selectAllCell(drawnItems, props),
            columns.map((column) => headerCell(column, props)),
          ),
        ),
        createElement(
          'tbody',
          null,
          tree.map((row) =>
            rowFor(row, columns, props, () => {
              setExpanded(
                expanded.includes(row.item.id)
                  ? expanded.filter((id) => id !== row.item.id)
                  : [...expanded, row.item.id],
              )
            }),
          ),
        ),
      ),
    ),
  )
}

function visibleColumns(
  rows: readonly WorkItem[],
  sort: ListSort,
): readonly { readonly column: ListColumn; readonly label: MessageKey }[] {
  const priorities = new Set(rows.map((item) => item.priority))
  return OPTIONAL_COLUMNS.filter(({ column }) => {
    if (column === LIST_COLUMN.priority)
      return (
        priorities.size > 1 ||
        sort.column === LIST_COLUMN.priority ||
        rows.some((item) => priorityTone(item.priority) !== 'quiet')
      )
    if (column === LIST_COLUMN.assignee) return rows.some((item) => item.assigneeId !== null)
    if (column === LIST_COLUMN.estimate) return rows.some((item) => item.estimate !== null)
    if (column === LIST_COLUMN.sprint) return rows.some((item) => item.sprintId !== null)
    return true
  })
}

interface HierarchicalRow {
  readonly item: WorkItem
  readonly depth: number
  readonly childCount: number
  readonly expanded: boolean
  readonly orphaned: boolean
}

function hierarchicalRows(
  rows: readonly WorkItem[],
  sort: ListSort,
  expanded: readonly WorkItemId[],
): readonly HierarchicalRow[] {
  const ids = new Set(rows.map((item) => item.id))
  const children = new Map<WorkItemId, WorkItem[]>()
  for (const item of rows) {
    if (item.parentId !== null && ids.has(item.parentId)) {
      children.set(item.parentId, [...(children.get(item.parentId) ?? []), item])
    }
  }
  const roots = rows.filter((item) => item.parentId === null || !ids.has(item.parentId))
  const result: HierarchicalRow[] = []
  const visit = (item: WorkItem, depth: number): void => {
    const descendants = sortWorkItems(children.get(item.id) ?? [], sort)
    const open = depth === 0 ? !expanded.includes(item.id) : expanded.includes(item.id)
    result.push({
      item,
      depth,
      childCount: descendants.length,
      expanded: open,
      orphaned: item.parentId !== null && !ids.has(item.parentId),
    })
    if (open) {
      for (const child of descendants) visit(child, depth + 1)
    }
  }
  for (const root of sortWorkItems(roots, sort)) visit(root, 0)
  return result
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
      active
        ? createElement(
            'span',
            { 'data-scrum-sort-direction': props.sort.direction, 'aria-hidden': true },
            props.sort.direction === 'ascending' ? '↑' : '↓',
          )
        : null,
    ),
  )
}

function rowFor(
  row: HierarchicalRow,
  columns: readonly { readonly column: ListColumn }[],
  props: ListProps,
  toggle: () => void,
): ReactElement {
  const { t } = props
  const { item } = row
  const selected = props.state.selected?.id === item.id
  const marked = props.marked.includes(item.id)
  const visible = new Set(columns.map(({ column }) => column))
  return createElement(
    'tr',
    {
      key: item.id,
      'data-scrum-list-row': item.id,
      'data-scrum-depth': row.depth,
      'aria-selected': selected,
    },
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
      { 'data-scrum-column': LIST_COLUMN.title },
      itemIdentity(row, props, toggle),
    ),
    visible.has(LIST_COLUMN.status)
      ? createElement('td', { 'data-scrum-column': LIST_COLUMN.status }, statusFor(item, t))
      : null,
    visible.has(LIST_COLUMN.priority)
      ? createElement(
          'td',
          { 'data-scrum-column': LIST_COLUMN.priority, 'data-scrum-priority-value': item.priority },
          priority(item, t),
        )
      : null,
    visible.has(LIST_COLUMN.assignee)
      ? createElement('td', { 'data-scrum-column': LIST_COLUMN.assignee }, assignee(item, t))
      : null,
    visible.has(LIST_COLUMN.estimate)
      ? createElement(
          'td',
          { 'data-scrum-column': LIST_COLUMN.estimate },
          item.estimate === null ? emptyValue(t('backlog.unestimated')) : String(item.estimate),
        )
      : null,
    visible.has(LIST_COLUMN.sprint)
      ? createElement(
          'td',
          { 'data-scrum-column': LIST_COLUMN.sprint },
          item.sprintId ?? emptyValue(t('list.noSprint')),
        )
      : null,
    createElement(
      'td',
      { 'data-scrum-column': LIST_COLUMN.updated },
      createElement(
        'time',
        { dateTime: item.updatedAt, title: new Date(item.updatedAt).toLocaleString() },
        relativeTime(item.updatedAt, t),
      ),
    ),
  )
}

function statusFor(item: WorkItem, t: Translate): ReactElement {
  const satisfied = item.acceptanceCriteria.filter((criterion) => criterion.satisfied).length
  if (item.status === WORK_ITEM_STATUS.done && satisfied < item.acceptanceCriteria.length) {
    return badge(t('list.status.acceptanceFailed'), 'attention')
  }
  if (item.status === WORK_ITEM_STATUS.done && item.resolution !== null) {
    return badge(
      t(resolutionLabel(item.resolution)),
      item.resolution === WORK_ITEM_RESOLUTION.done ? 'complete' : 'quiet',
    )
  }
  return badge(t(statusLabel(item.status)), statusTone(item.status))
}

function priority(item: WorkItem, t: Translate): ReactElement {
  const tone = priorityTone(item.priority)
  return createElement('span', { 'data-scrum-priority': tone }, t(priorityLabel(item.priority)))
}

function assignee(item: WorkItem, t: Translate): ReactElement {
  if (item.assigneeId === null) {
    return createElement('span', {
      'data-scrum-avatar': 'empty',
      title: t('list.unassigned'),
      'aria-label': t('list.unassigned'),
    })
  }
  return createElement(
    'span',
    { 'data-scrum-avatar': 'assigned', title: item.assigneeId, 'aria-label': item.assigneeId },
    item.assigneeId.slice(0, 2).toUpperCase(),
  )
}

function relativeTime(timestamp: string, t: Translate): string {
  const elapsed = Math.max(0, Date.now() - new Date(timestamp).getTime())
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return t('list.updated.justNow')
  if (minutes < 60) return t('list.updated.minutesAgo').replace('{value}', String(minutes))
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('list.updated.hoursAgo').replace('{value}', String(hours))
  const days = Math.floor(hours / 24)
  return t('list.updated.daysAgo').replace('{value}', String(days))
}

/**
 * The part of a row people actually scan.
 *
 * Identity, hierarchy and warning signals belong together: spreading them
 * across five equal columns made the title visually indistinguishable from
 * metadata, while hiding them would make the compact table less truthful.
 */
function itemIdentity(row: HierarchicalRow, props: ListProps, toggle: () => void): ReactElement {
  const { t } = props
  const { item } = row
  const selected = props.state.selected?.id === item.id
  const hasMeta = item.category !== null || row.orphaned || item.labels.length > 0
  const hasSignals = item.blockedReason !== null || item.dependsOn.length > 0
  return createElement(
    'div',
    { 'data-scrum-item-identity': true, 'data-scrum-tree-depth': row.depth },
    row.childCount === 0
      ? createElement('span', { 'data-scrum-tree-spacer': true })
      : createElement(
          'button',
          {
            type: 'button',
            'data-scrum-tree-toggle': item.id,
            'aria-expanded': row.expanded,
            'aria-label': t(row.expanded ? 'list.tree.collapse' : 'list.tree.expand'),
            onClick: toggle,
          },
          row.expanded ? '⌄' : '›',
        ),
    createElement(
      'a',
      {
        href: `#${item.id}`,
        'aria-current': selected ? 'true' : undefined,
        'data-scrum-item-open': item.id,
        onClick: (event: { preventDefault: () => void }) => {
          event.preventDefault()
          props.actions.select(selected ? null : item.id)
        },
      },
      createElement(
        'span',
        {
          'data-scrum-type-icon': item.type,
          title: t(typeLabel(item.type)),
          'aria-label': t(typeLabel(item.type)),
        },
        typeMark(item),
      ),
      createElement('span', { 'data-scrum-item-key': true }, item.id),
      createElement('span', { 'data-scrum-item-title': true }, item.title),
      row.childCount === 0
        ? null
        : createElement(
            'span',
            { 'data-scrum-child-count': true },
            t('list.tree.children').replace('{value}', String(row.childCount)),
          ),
    ),
    hasMeta
      ? createElement(
          'div',
          { 'data-scrum-item-meta': true },
          item.category === null
            ? null
            : createElement(
                'span',
                { 'data-scrum-category': true },
                t(categoryLabel(item.category)),
              ),
          row.orphaned
            ? createElement(
                'span',
                { 'data-scrum-parent': true },
                `${t('item.parent')} ${item.parentId}`,
              )
            : null,
          item.labels.map((label) =>
            createElement('span', { key: label, 'data-scrum-label': true }, label),
          ),
        )
      : null,
    hasSignals
      ? createElement(
          'div',
          { 'data-scrum-item-signals': true },
          item.blockedReason === null
            ? null
            : createElement(
                'span',
                { 'data-scrum-item-signal': 'blocked' },
                t('list.signal.blocked'),
              ),
          item.dependsOn.length === 0
            ? null
            : createElement(
                'span',
                { 'data-scrum-item-signal': 'dependency' },
                `${t('list.signal.dependencies')} ${item.dependsOn.length}`,
              ),
        )
      : null,
  )
}

function typeMark(item: WorkItem): string {
  switch (item.type) {
    case 'epic':
      return 'E'
    case 'story':
      return 'S'
    case 'task':
      return 'T'
    case 'bug':
      return '!'
    case 'subtask':
      return '↳'
  }
}

function emptyValue(label: string): ReactElement {
  return createElement(
    'span',
    { 'data-scrum-empty-value': true, title: label, 'aria-label': label },
    '—',
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
