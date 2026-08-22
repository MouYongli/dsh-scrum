import { createElement, useState, type FormEvent, type ReactElement } from 'react'
import { toTimestamp, type Timestamp } from '@dsh-scrum/scrum-domain'
import type { NewSprint } from './client.js'
import { sameDraft, useDraftGuard } from './drafts.js'
import type { Translate } from './messages.js'

/** What the creation form holds: two calendar dates, as the browser spells them. */
export interface SprintFields {
  readonly name: string
  readonly goal: string
  readonly startDate: string
  readonly endDate: string
}

export const EMPTY_SPRINT_FIELDS: SprintFields = {
  name: '',
  goal: '',
  startDate: '',
  endDate: '',
}

/**
 * A calendar day, read as the instant it starts in UTC.
 *
 * A date input answers `2026-03-16` and nothing more, so the time and the zone
 * have to come from somewhere. UTC midnight is chosen because a sprint
 * boundary is a day the team agreed on rather than a moment, and interpreting
 * it in whatever zone the browser happens to sit in would make the stored
 * boundary move when the same user opened the plugin from another machine.
 */
export function toSprintDate(day: string): Timestamp {
  return toTimestamp(`${day}T00:00:00.000Z`)
}

export function toNewSprint(fields: SprintFields): NewSprint {
  return {
    name: fields.name.trim(),
    goal: fields.goal,
    startDate: toSprintDate(fields.startDate),
    endDate: toSprintDate(fields.endDate),
  }
}

/** The calendar spelling of a stored instant, for a date input's value. */
export function toDay(timestamp: Timestamp): string {
  return timestamp.slice(0, 10)
}

export interface SprintFormProps {
  readonly t: Translate
  readonly busy: boolean
  readonly onSubmit: (input: NewSprint) => void
  readonly onCancel: () => void
}

/**
 * Creating a sprint.
 *
 * The dates are required here rather than editable later: they are the
 * baseline every "did it land on time" question is measured against, and a
 * sprint that could be re-dated afterwards would be one whose report changes
 * meaning after the fact.
 */
export function SprintForm(props: SprintFormProps): ReactElement {
  const [fields, setFields] = useState(EMPTY_SPRINT_FIELDS)
  useDraftGuard(!sameDraft(fields, EMPTY_SPRINT_FIELDS))
  const t = props.t

  function submit(event: FormEvent): void {
    event.preventDefault()
    props.onSubmit(toNewSprint(fields))
  }

  function field(
    key: keyof SprintFields,
    label: string,
    type: 'text' | 'date',
    required: boolean,
  ): ReactElement {
    const id = `scrum-sprint-${key}`
    return createElement(
      'p',
      { key: id },
      createElement('label', { htmlFor: id }, label),
      createElement('input', {
        id,
        type,
        required,
        value: fields[key],
        onChange: (event: { target: { value: string } }) => {
          setFields({ ...fields, [key]: event.target.value })
        },
      }),
    )
  }

  return createElement(
    'form',
    { onSubmit: submit, 'data-scrum-sprint-form': true },
    createElement('h3', null, t('sprint.create.title')),
    field('name', t('sprint.name'), 'text', true),
    field('goal', t('sprint.goal'), 'text', false),
    field('startDate', t('sprint.startDate'), 'date', true),
    field('endDate', t('sprint.endDate'), 'date', true),
    createElement(
      'button',
      { type: 'submit', disabled: props.busy, 'data-scrum-sprint-submit': true },
      t('sprint.create.submit'),
    ),
    createElement(
      'button',
      { type: 'button', onClick: props.onCancel, 'data-scrum-sprint-cancel': true },
      t('item.cancel'),
    ),
  )
}
