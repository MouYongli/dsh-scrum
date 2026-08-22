import { createElement, useState, type FormEvent, type ReactElement } from 'react'
import {
  PRIORITY,
  WORK_ITEM_TYPE,
  type AcceptanceCriterion,
  type Priority,
  type WorkItem,
  type WorkItemDetailChanges,
  type WorkItemType,
} from '@dsh-scrum/scrum-domain'
import type { NewWorkItem } from './client.js'
import type { MessageKey, Translate } from './messages.js'
import { PRIORITIES, WORK_ITEM_TYPES, priorityLabel, typeLabel } from './vocabulary.js'

/** What the two forms hold while the user is typing. */
export interface WorkItemFields {
  readonly type: WorkItemType
  readonly title: string
  readonly description: string
  readonly priority: Priority
  /** Free text, because an empty box has to mean "not sized", not zero. */
  readonly estimate: string
  /** Comma separated, the way the user typed it. */
  readonly labels: string
}

export const EMPTY_FIELDS: WorkItemFields = {
  type: WORK_ITEM_TYPE.story,
  title: '',
  description: '',
  priority: PRIORITY.medium,
  estimate: '',
  labels: '',
}

export function fieldsOf(item: WorkItem): WorkItemFields {
  return {
    type: item.type,
    title: item.title,
    description: item.description,
    priority: item.priority,
    estimate: item.estimate === null ? '' : String(item.estimate),
    labels: item.labels.join(', '),
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
    title: fields.title.trim(),
    description: fields.description,
    priority: fields.priority,
    labels: toLabels(fields.labels),
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
    title: fields.title.trim(),
    description: fields.description,
    priority: fields.priority,
    estimate: toEstimate(fields.estimate),
    labels: toLabels(fields.labels),
  }
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
  const t = props.t

  function submit(event: FormEvent): void {
    event.preventDefault()
    props.onSubmit(fields)
  }

  function change<Key extends keyof WorkItemFields>(key: Key, value: WorkItemFields[Key]): void {
    setFields({ ...fields, [key]: value })
  }

  return createElement(
    'form',
    { onSubmit: submit, 'data-scrum-item-form': props.id },
    choice(
      `${props.id}-type`,
      t('item.type'),
      fields.type,
      WORK_ITEM_TYPES,
      typeLabel,
      t,
      (value) => {
        change('type', value)
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
    text(
      `${props.id}-estimate`,
      t('item.estimate'),
      fields.estimate,
      false,
      (value) => {
        change('estimate', value)
      },
      t('item.estimateHint'),
    ),
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
