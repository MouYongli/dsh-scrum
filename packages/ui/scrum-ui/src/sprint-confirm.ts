import { createElement, useState, type ReactElement } from 'react'
import { SPRINT_STATUS, type Sprint, type SprintId, type WorkItemId } from '@dsh-scrum/scrum-domain'
import type { Disposition } from './client.js'
import type { Translate } from './messages.js'
import type { SprintConfirmation } from './sprint-controller.js'

/**
 * Which sprints an unfinished item may be carried into.
 *
 * The one being closed is not among them, and neither is a closed one: a
 * closed sprint is a record of what was delivered, and admitting work into it
 * would rewrite a history reports have already been drawn from.
 */
export function carryTargets(sprints: readonly Sprint[], closing: SprintId): readonly Sprint[] {
  return sprints.filter((sprint) => sprint.id !== closing && sprint.status !== SPRINT_STATUS.closed)
}

/** Where the user has decided each unfinished item goes, so far. */
export type Decisions = Readonly<Record<string, string>>

const TO_BACKLOG = 'backlog'

export function toDispositions(
  unfinished: readonly { readonly id: WorkItemId; readonly revision: number }[],
  decisions: Decisions,
): readonly Disposition[] | null {
  const dispositions: Disposition[] = []
  for (const item of unfinished) {
    const decision = decisions[item.id]
    if (decision === undefined || decision === '') {
      return null
    }
    dispositions.push({
      workItemId: item.id,
      expectedRevision: item.revision as Disposition['expectedRevision'],
      moveTo: decision === TO_BACKLOG ? null : (decision as SprintId),
    })
  }
  return dispositions
}

export interface ConfirmProps {
  readonly confirmation: SprintConfirmation
  readonly sprints: readonly Sprint[]
  readonly t: Translate
  readonly busy: boolean
  readonly onCancel: () => void
  readonly onStart: () => void
  readonly onClose: (resultSummary: string, dispositions: readonly Disposition[]) => void
}

/**
 * The question before a sprint opens or shuts.
 *
 * Nothing is defaulted for the unfinished items. "Back to the backlog" and
 * "into the next sprint" mean different things to the next planning session,
 * and a preselected answer is one the user is recorded as having given without
 * reading it. The close control stays out of reach until every item has one.
 */
export function SprintConfirmDialog(props: ConfirmProps): ReactElement {
  const [summary, setSummary] = useState('')
  const [decisions, setDecisions] = useState<Decisions>({})
  const { confirmation, t } = props
  const start = confirmation.kind === 'start'
  const dispositions = start
    ? []
    : toDispositions(
        confirmation.unfinished.map((item) => ({ id: item.id, revision: item.revision })),
        decisions,
      )

  return createElement(
    'div',
    {
      role: 'dialog',
      'aria-modal': true,
      'data-scrum-confirm': confirmation.kind,
      'aria-label': t(start ? 'sprint.start.title' : 'sprint.close.title'),
    },
    createElement('h3', null, t(start ? 'sprint.start.title' : 'sprint.close.title')),
    createElement(
      'p',
      null,
      `${t(start ? 'sprint.start.body' : 'sprint.close.body')} ${confirmation.sprint.name}`,
    ),
    start ? null : summaryField(props, summary, setSummary),
    start ? null : unfinishedList(props, decisions, setDecisions),
    createElement(
      'button',
      {
        type: 'button',
        disabled: props.busy || dispositions === null,
        'data-scrum-confirm-submit': confirmation.kind,
        onClick: () => {
          if (start) {
            props.onStart()
          } else if (dispositions !== null) {
            props.onClose(summary, dispositions)
          }
        },
      },
      t(start ? 'sprint.start.submit' : 'sprint.close.submit'),
    ),
    createElement(
      'button',
      { type: 'button', onClick: props.onCancel, 'data-scrum-confirm-cancel': true },
      t('item.cancel'),
    ),
  )
}

function summaryField(
  props: ConfirmProps,
  value: string,
  onChange: (next: string) => void,
): ReactElement {
  const id = 'scrum-close-summary'
  return createElement(
    'p',
    null,
    createElement('label', { htmlFor: id }, props.t('sprint.close.summary')),
    createElement('input', {
      id,
      value,
      onChange: (event: { target: { value: string } }) => {
        onChange(event.target.value)
      },
    }),
  )
}

function unfinishedList(
  props: ConfirmProps,
  decisions: Decisions,
  setDecisions: (next: Decisions) => void,
): ReactElement {
  const { confirmation, t } = props
  if (confirmation.kind === 'start') {
    return createElement('p', null)
  }
  if (confirmation.unfinished.length === 0) {
    return createElement('p', { 'data-scrum-unfinished': 0 }, t('sprint.close.allDone'))
  }
  const targets = carryTargets(props.sprints, confirmation.sprint.id)
  return createElement(
    'ul',
    { 'data-scrum-unfinished': confirmation.unfinished.length },
    confirmation.unfinished.map((item) => {
      const id = `scrum-disposition-${item.id}`
      return createElement(
        'li',
        { key: item.id },
        createElement('label', { htmlFor: id }, `${item.id} · ${item.title}`),
        createElement(
          'select',
          {
            id,
            value: decisions[item.id] ?? '',
            'data-scrum-disposition': item.id,
            onChange: (event: { target: { value: string } }) => {
              setDecisions({ ...decisions, [item.id]: event.target.value })
            },
          },
          createElement('option', { key: '', value: '' }, t('sprint.close.choose')),
          createElement(
            'option',
            { key: TO_BACKLOG, value: TO_BACKLOG },
            t('sprint.close.toBacklog'),
          ),
          targets.map((sprint) =>
            createElement('option', { key: sprint.id, value: sprint.id }, sprint.name),
          ),
        ),
      )
    }),
  )
}
