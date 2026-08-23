import { createElement, useState, type FormEvent, type ReactElement } from 'react'
import {
  PRIORITY,
  WORK_ITEM_TYPE,
  workItemLevel,
  type AcceptanceCriterion,
  type BugSeverity,
  type Priority,
  type WorkItem,
  type WorkItemCategory,
  type WorkItemDetailChanges,
  type WorkItemType,
} from '@dsh-scrum/scrum-domain'
import type { NewWorkItem } from './client.js'
import { sameDraft, useDraftGuard } from './drafts.js'
import type { MessageKey, Translate } from './messages.js'
import {
  BUG_SEVERITIES,
  PRIORITIES,
  WORK_ITEM_CATEGORIES,
  WORK_ITEM_TYPES,
  categoryLabel,
  priorityLabel,
  recommendedTypeFor,
  severityLabel,
  typeLabel,
} from './vocabulary.js'

/**
 * One field a type carries, as the form draws it.
 *
 * A table rather than a branch per type: the shapes differ only in which
 * fields they have and how each is entered, and a hand-written block per type
 * would be five places to forget when the domain gains a field.
 */
interface DetailField {
  readonly key: string
  readonly label: MessageKey
  readonly kind: 'line' | 'prose' | 'days' | 'flag' | 'severity'
  readonly hint?: MessageKey
}

const DETAIL_FIELDS: Readonly<Record<WorkItemType, readonly DetailField[]>> = {
  [WORK_ITEM_TYPE.epic]: [{ key: 'color', label: 'item.color', kind: 'line' }],
  [WORK_ITEM_TYPE.story]: [],
  [WORK_ITEM_TYPE.task]: [
    { key: 'timebox', label: 'item.timebox', kind: 'days' },
    { key: 'outcome', label: 'item.outcome', kind: 'prose', hint: 'item.outcomeHint' },
  ],
  [WORK_ITEM_TYPE.bug]: [
    { key: 'severity', label: 'item.severity', kind: 'severity', hint: 'item.severityHint' },
    { key: 'stepsToReproduce', label: 'item.stepsToReproduce', kind: 'prose' },
    { key: 'expected', label: 'item.expected', kind: 'prose' },
    { key: 'actual', label: 'item.actual', kind: 'prose' },
    { key: 'environment', label: 'item.environment', kind: 'line' },
    { key: 'affectedVersion', label: 'item.affectedVersion', kind: 'line' },
    { key: 'isRegression', label: 'item.isRegression', kind: 'flag' },
    { key: 'rootCause', label: 'item.rootCause', kind: 'prose' },
  ],
  [WORK_ITEM_TYPE.subtask]: [],
}

/** What the two forms hold while the user is typing. */
export interface WorkItemFields {
  readonly type: WorkItemType
  /** `null` is a value here too: not every item is one kind of work. */
  readonly category: WorkItemCategory | null
  readonly title: string
  readonly description: string
  readonly priority: Priority
  /** Free text, because an empty box has to mean "not sized", not zero. */
  readonly estimate: string
  /** Comma separated, the way the user typed it. */
  readonly labels: string
  /**
   * The type's own fields, held as text under their stored names.
   *
   * Text for the same reason the estimate is: a blank box means the field was
   * not filled in, and a form that turned that into a zero or a `false` would
   * be writing down an answer nobody gave.
   */
  readonly details: Readonly<Record<string, string>>
}

export const EMPTY_FIELDS: WorkItemFields = {
  type: WORK_ITEM_TYPE.story,
  category: null,
  title: '',
  description: '',
  priority: PRIORITY.medium,
  estimate: '',
  labels: '',
  details: {},
}

export function fieldsOf(item: WorkItem): WorkItemFields {
  const stored = item.typeDetails as Record<string, unknown>
  return {
    type: item.type,
    category: item.category,
    title: item.title,
    description: item.description,
    priority: item.priority,
    estimate: item.estimate === null ? '' : String(item.estimate),
    labels: item.labels.join(', '),
    details: Object.fromEntries(
      DETAIL_FIELDS[item.type].map((field) => [field.key, textOf(stored[field.key])]),
    ),
  }
}

/**
 * A stored detail value as the box holds it.
 *
 * Only the four shapes the details actually carry are read back. Anything else
 * is a value this build did not write, and showing `[object Object]` in a text
 * box would invite somebody to save it back over whatever was really there.
 */
function textOf(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'yes' : ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

/**
 * What the type's fields mean as a payload, tagged with the type they describe.
 *
 * The tag is what stops a half-edited form writing a bug's severity onto an
 * epic: the domain refuses details that name another type rather than dropping
 * the fields beside them.
 */
export function toTypeDetails(fields: WorkItemFields): Record<string, unknown> {
  const details: Record<string, unknown> = { type: fields.type }
  for (const field of DETAIL_FIELDS[fields.type]) {
    const raw = fields.details[field.key] ?? ''
    details[field.key] = toDetailValue(field, raw)
  }
  return details
}

function toDetailValue(field: DetailField, raw: string): unknown {
  const trimmed = raw.trim()
  switch (field.kind) {
    case 'flag':
      return trimmed !== ''
    case 'days': {
      if (trimmed === '') return null
      const parsed = Number(trimmed)
      // Passed through unguessed at: the domain refuses it and says so, which
      // beats silently storing a different number.
      return Number.isFinite(parsed) ? parsed : trimmed
    }
    case 'severity':
      return trimmed === '' ? null : trimmed
    default:
      return trimmed
  }
}

/**
 * An estimate box that was left empty means the item is not sized, which is
 * not the same as sized at zero: the sprint progress counts the two
 * separately, and a form that turned one into the other would quietly report
 * a project as fully estimated.
 *
 * Anything that is not a number is passed through as `null` rather than
 * guessed at. The domain refuses the write and says so, which is a better
 * answer than a silently different number.
 */
export function toEstimate(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function toLabels(value: string): readonly string[] {
  return value
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label !== '')
}

export function toNewWorkItem(fields: WorkItemFields): NewWorkItem {
  return {
    type: fields.type,
    category: fields.category,
    title: fields.title.trim(),
    description: fields.description,
    priority: fields.priority,
    labels: toLabels(fields.labels),
    typeDetails: toTypeDetails(fields),
  }
}

/**
 * Everything the detail form can change, sent whole.
 *
 * Not a diff against what was loaded: the write carries the revision the user
 * was looking at, so the store rejects it if anything moved underneath. A diff
 * would additionally have to decide what "unchanged" means for a field the
 * user cleared, and there is no reading of that which is not a guess.
 */
export function toDetailChanges(fields: WorkItemFields): WorkItemDetailChanges {
  return {
    type: fields.type,
    category: fields.category,
    title: fields.title.trim(),
    description: fields.description,
    priority: fields.priority,
    // An epic and a subtask carry none, and the domain refuses one on them, so
    // the form does not send back a number it stopped showing.
    estimate: isPlannableType(fields.type) ? toEstimate(fields.estimate) : null,
    labels: toLabels(fields.labels),
    typeDetails: toTypeDetails(fields),
  }
}

/**
 * Whether a type is one a sprint holds and estimates.
 *
 * Compared against a story's level rather than against the number 2. A story
 * is the level a sprint plans, by definition; writing the number here would be
 * a second place to change if a level were ever added above an epic.
 */
const PLANNABLE_LEVEL = workItemLevel(WORK_ITEM_TYPE.story)

function isPlannableType(type: WorkItemType): boolean {
  return workItemLevel(type) === PLANNABLE_LEVEL
}

export interface WorkItemFormProps {
  readonly t: Translate
  readonly id: string
  readonly initial: WorkItemFields
  readonly submitLabel: MessageKey
  readonly busy: boolean
  readonly onSubmit: (fields: WorkItemFields) => void
  readonly onCancel?: (() => void) | undefined
}

/**
 * The fields a work item is created and edited through.
 *
 * One component for both. The two differ only in what they do with the values
 * and what the button says, and a second copy would be the one that stops
 * getting a field the first one gained.
 */
export function WorkItemForm(props: WorkItemFormProps): ReactElement {
  const [fields, setFields] = useState(props.initial)
  // Against what it opened with, not against empty: the detail form starts
  // full of the item's own values and has nothing unsaved until they move.
  useDraftGuard(!sameDraft(fields, props.initial))
  const t = props.t

  function submit(event: FormEvent): void {
    event.preventDefault()
    props.onSubmit(fields)
  }

  function change<Key extends keyof WorkItemFields>(key: Key, value: WorkItemFields[Key]): void {
    setFields({ ...fields, [key]: value })
  }

  /**
   * Choosing a kind of work preselects the type it is usually filed as.
   *
   * This way round because that is the direction the model is written in: a
   * category suggests a type, and the reverse has no single answer — five
   * categories suggest a task. Only the type moves, never a type the user has
   * already changed away from on purpose... which this cannot tell apart, so
   * it moves it and leaves the selector right there to change back.
   */
  function chooseCategory(category: WorkItemCategory | null): void {
    setFields({
      ...fields,
      category,
      type: category === null ? fields.type : recommendedTypeFor(category),
    })
  }

  /** A type change carries no detail values across; the fields are not the same. */
  function chooseType(type: WorkItemType): void {
    setFields({ ...fields, type, details: {} })
  }

  return createElement(
    'form',
    { onSubmit: submit, 'data-scrum-item-form': props.id },
    optionalChoice(
      `${props.id}-category`,
      t('item.category'),
      fields.category,
      WORK_ITEM_CATEGORIES,
      categoryLabel,
      t,
      t('item.uncategorised'),
      chooseCategory,
      t('item.categoryHint'),
    ),
    choice(
      `${props.id}-type`,
      t('item.type'),
      fields.type,
      WORK_ITEM_TYPES,
      typeLabel,
      t,
      (value) => {
        chooseType(value)
      },
    ),
    text(`${props.id}-title`, t('item.title'), fields.title, true, (value) => {
      change('title', value)
    }),
    area(`${props.id}-description`, t('item.description'), fields.description, (value) => {
      change('description', value)
    }),
    choice(
      `${props.id}-priority`,
      t('item.priority'),
      fields.priority,
      PRIORITIES,
      priorityLabel,
      t,
      (value) => {
        change('priority', value)
      },
    ),
    // An epic aggregates its children's points and a subtask is not sized at
    // all, so the box is absent rather than shown and refused on submit.
    isPlannableType(fields.type)
      ? text(
          `${props.id}-estimate`,
          t('item.estimate'),
          fields.estimate,
          false,
          (value) => {
            change('estimate', value)
          },
          t('item.estimateHint'),
        )
      : null,
    text(
      `${props.id}-labels`,
      t('item.labels'),
      fields.labels,
      false,
      (value) => {
        change('labels', value)
      },
      t('item.labelsHint'),
    ),
    detailBlock(props.id, fields, t, (key, value) => {
      change('details', { ...fields.details, [key]: value })
    }),
    createElement(
      'button',
      { type: 'submit', disabled: props.busy, 'data-scrum-item-submit': true },
      t(props.busy ? 'item.saving' : props.submitLabel),
    ),
    props.onCancel === undefined
      ? null
      : createElement(
          'button',
          { type: 'button', onClick: props.onCancel, 'data-scrum-item-cancel': true },
          t('item.cancel'),
        ),
  )
}

/** A labelled input. The label is bound by id, so a screen reader announces it. */
function text(
  id: string,
  label: string,
  value: string,
  required: boolean,
  onChange: (next: string) => void,
  hint?: string,
): ReactElement {
  const hintId = `${id}-hint`
  return createElement(
    'p',
    { key: id },
    createElement('label', { htmlFor: id }, label),
    createElement('input', {
      id,
      value,
      required,
      'aria-describedby': hint === undefined ? undefined : hintId,
      onChange: (event: { target: { value: string } }) => {
        onChange(event.target.value)
      },
    }),
    hint === undefined ? null : createElement('span', { id: hintId }, hint),
  )
}

function area(
  id: string,
  label: string,
  value: string,
  onChange: (next: string) => void,
): ReactElement {
  return createElement(
    'p',
    { key: id },
    createElement('label', { htmlFor: id }, label),
    createElement('textarea', {
      id,
      value,
      onChange: (event: { target: { value: string } }) => {
        onChange(event.target.value)
      },
    }),
  )
}

/**
 * The fields the chosen type carries, drawn from the table above.
 *
 * Absent rather than disabled for a type with none: a story has no fields of
 * its own, and an empty labelled box would invite somebody to look for what
 * belongs in it.
 */
function detailBlock(
  id: string,
  fields: WorkItemFields,
  t: Translate,
  onChange: (key: string, value: string) => void,
): ReactElement | null {
  const spec = DETAIL_FIELDS[fields.type]
  if (spec.length === 0) {
    return null
  }
  return createElement(
    'fieldset',
    { 'data-scrum-item-details': fields.type },
    createElement('legend', null, t(typeLabel(fields.type))),
    spec.map((field) => detailField(id, field, fields.details[field.key] ?? '', t, onChange)),
  )
}

function detailField(
  id: string,
  field: DetailField,
  value: string,
  t: Translate,
  onChange: (key: string, value: string) => void,
): ReactElement {
  const fieldId = `${id}-${field.key}`
  const hint = field.hint === undefined ? undefined : t(field.hint)
  switch (field.kind) {
    case 'prose':
      return area(fieldId, t(field.label), value, (next) => {
        onChange(field.key, next)
      })
    case 'flag':
      return check(fieldId, t(field.label), value !== '', (next) => {
        onChange(field.key, next ? 'yes' : '')
      })
    case 'severity':
      return optionalChoice(
        fieldId,
        t(field.label),
        value === '' ? null : (value as BugSeverity),
        BUG_SEVERITIES,
        severityLabel,
        t,
        t('severity.none'),
        (next) => {
          onChange(field.key, next ?? '')
        },
        hint,
      )
    default:
      return text(
        fieldId,
        t(field.label),
        value,
        false,
        (next) => {
          onChange(field.key, next)
        },
        hint,
      )
  }
}

function check(
  id: string,
  label: string,
  checked: boolean,
  onChange: (next: boolean) => void,
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
 * A selector whose vocabulary admits "nobody said".
 *
 * The blank option is a named choice rather than an empty row, for the reason
 * the label exists: a list with a silent first entry reads as a list that
 * failed to load.
 */
function optionalChoice<Value extends string>(
  id: string,
  label: string,
  value: Value | null,
  options: readonly Value[],
  labelOf: (option: Value | null) => MessageKey,
  t: Translate,
  blank: string,
  onChange: (next: Value | null) => void,
  hint?: string,
): ReactElement {
  const hintId = `${id}-hint`
  return createElement(
    'p',
    { key: id },
    createElement('label', { htmlFor: id }, label),
    createElement(
      'select',
      {
        id,
        value: value ?? '',
        'aria-describedby': hint === undefined ? undefined : hintId,
        onChange: (event: { target: { value: string } }) => {
          onChange(event.target.value === '' ? null : (event.target.value as Value))
        },
      },
      createElement('option', { key: '', value: '' }, blank),
      options.map((option) =>
        createElement('option', { key: option, value: option }, t(labelOf(option))),
      ),
    ),
    hint === undefined ? null : createElement('span', { id: hintId }, hint),
  )
}

function choice<Value extends string>(
  id: string,
  label: string,
  value: Value,
  options: readonly Value[],
  labelOf: (option: Value) => MessageKey,
  t: Translate,
  onChange: (next: Value) => void,
): ReactElement {
  return createElement(
    'p',
    { key: id },
    createElement('label', { htmlFor: id }, label),
    createElement(
      'select',
      {
        id,
        value,
        onChange: (event: { target: { value: string } }) => {
          onChange(event.target.value as Value)
        },
      },
      options.map((option) =>
        createElement('option', { key: option, value: option }, t(labelOf(option))),
      ),
    ),
  )
}

export interface CriteriaProps {
  readonly t: Translate
  readonly criteria: readonly AcceptanceCriterion[]
  readonly busy: boolean
  readonly onToggle: (index: number, satisfied: boolean) => void
  readonly onChange: (criteria: readonly AcceptanceCriterion[]) => void
}

/**
 * The acceptance criteria, addressed by position.
 *
 * Position is what the domain stores them under: the whole item is written
 * under one revision, so a concurrent edit that reordered the list is rejected
 * before a toggle could land on the wrong one.
 *
 * Deliberately outside the detail form and written through immediately. A list
 * held as unsaved form state would let the user tick a criterion that is not
 * where the store thinks it is, and ticking by position is exactly the
 * operation that cannot survive that.
 */
export function AcceptanceCriteria(props: CriteriaProps): ReactElement {
  const [draft, setDraft] = useState('')
  useDraftGuard(draft !== '')

  function add(): void {
    const text = draft.trim()
    if (text === '') {
      return
    }
    setDraft('')
    props.onChange([...props.criteria, { text, satisfied: false }])
  }

  return createElement(
    'section',
    { 'data-scrum-criteria-list': true },
    createElement('h4', null, props.t('backlog.criteria')),
    props.criteria.length === 0
      ? createElement('p', null, props.t('item.noCriteria'))
      : createElement(
          'ul',
          null,
          props.criteria.map((criterion, index) =>
            createElement(
              'li',
              { key: `${index}-${criterion.text}` },
              createElement('input', {
                id: `scrum-criterion-${index}`,
                type: 'checkbox',
                checked: criterion.satisfied,
                disabled: props.busy,
                onChange: (event: { target: { checked: boolean } }) => {
                  props.onToggle(index, event.target.checked)
                },
              }),
              createElement('label', { htmlFor: `scrum-criterion-${index}` }, criterion.text),
              createElement(
                'button',
                {
                  type: 'button',
                  disabled: props.busy,
                  'data-scrum-criterion-remove': index,
                  onClick: () => {
                    props.onChange(props.criteria.filter((_, position) => position !== index))
                  },
                },
                props.t('item.removeCriterion'),
              ),
            ),
          ),
        ),
    createElement(
      'p',
      null,
      createElement('label', { htmlFor: 'scrum-criterion-new' }, props.t('item.addCriterion')),
      createElement('input', {
        id: 'scrum-criterion-new',
        value: draft,
        onChange: (event: { target: { value: string } }) => {
          setDraft(event.target.value)
        },
      }),
      createElement(
        'button',
        { type: 'button', disabled: props.busy, 'data-scrum-criterion-add': true, onClick: add },
        props.t('item.addCriterion'),
      ),
    ),
  )
}
