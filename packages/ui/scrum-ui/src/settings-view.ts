import { createElement, useState, type FormEvent, type ReactElement } from 'react'
import {
  ESTIMATION_METHOD,
  VELOCITY_BASIS,
  type EstimationMethod,
  type VelocityBasis,
  type WorkItemStatus,
} from '@dsh-scrum/scrum-domain'
import type { AuthorizationView, ConfigureProjectInput, ProjectSettingsView } from './client.js'
import type { MessageKey, Translate } from './messages.js'
import type { SettingsState } from './settings-controller.js'
import { statusLabel } from './vocabulary.js'

export interface SettingsActions {
  readonly save: (changes: ConfigureProjectInput['changes']) => void
  readonly reload: () => void
  readonly dismiss: () => void
}

export interface SettingsProps {
  readonly state: SettingsState
  readonly authorization: AuthorizationView | null
  readonly actions: SettingsActions
  readonly t: Translate
  /** True where the project is archived or the user may not configure it. */
  readonly readOnly: boolean
}

const ESTIMATION_METHODS: readonly {
  readonly value: EstimationMethod
  readonly label: MessageKey
}[] = [
  { value: ESTIMATION_METHOD.storyPoints, label: 'settings.estimation.storyPoints' },
  { value: ESTIMATION_METHOD.hours, label: 'settings.estimation.hours' },
  { value: ESTIMATION_METHOD.count, label: 'settings.estimation.count' },
]

const VELOCITY_BASES: readonly { readonly value: VelocityBasis; readonly label: MessageKey }[] = [
  { value: VELOCITY_BASIS.delivered, label: 'settings.velocity.delivered' },
  { value: VELOCITY_BASIS.finished, label: 'settings.velocity.finished' },
]

/**
 * What a form is holding while it is being edited.
 *
 * Kept as text rather than as the stored types: a number box is empty for a
 * moment while somebody retypes it, and a state that could only hold numbers
 * would have to invent a value for that moment.
 */
interface Draft {
  readonly displayNames: Readonly<Record<string, string>>
  readonly definitionOfReady: string
  readonly definitionOfDone: string
  readonly estimationMethod: EstimationMethod
  readonly sprintLengthInDays: string
  readonly workInProgressLimit: string
  readonly velocityBasis: VelocityBasis
  readonly stalledAfterDays: string
}

function draftOf(settings: ProjectSettingsView): Draft {
  return {
    displayNames: { ...settings.statusDisplayNames },
    definitionOfReady: settings.definitionOfReady.join('\n'),
    definitionOfDone: settings.definitionOfDone.join('\n'),
    estimationMethod: settings.estimationMethod,
    sprintLengthInDays: String(settings.sprintLengthInDays),
    // An empty box is "no limit", which is the stored null. They must stay the
    // same thing, or clearing the box would set a limit of zero.
    workInProgressLimit:
      settings.workInProgressLimit === null ? '' : String(settings.workInProgressLimit),
    velocityBasis: settings.velocityBasis,
    stalledAfterDays: String(settings.stalledAfterDays),
  }
}

/** One entry per line, blank lines dropped. A checklist is a list, not prose. */
function toEntries(text: string): readonly string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

function toChanges(draft: Draft): ConfigureProjectInput['changes'] {
  return {
    statusDisplayNames: draft.displayNames,
    definitionOfReady: toEntries(draft.definitionOfReady),
    definitionOfDone: toEntries(draft.definitionOfDone),
    estimationMethod: draft.estimationMethod,
    sprintLengthInDays: Number(draft.sprintLengthInDays),
    workInProgressLimit:
      draft.workInProgressLimit.trim() === '' ? null : Number(draft.workInProgressLimit),
    velocityBasis: draft.velocityBasis,
    stalledAfterDays: Number(draft.stalledAfterDays),
  }
}

export function ProjectSettings(props: SettingsProps): ReactElement {
  const { t, state } = props
  const settings = state.settings
  const [source, setSource] = useState<ProjectSettingsView | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  // Reset during render rather than in an effect. An effect runs after the
  // first paint, so the form would draw once with no draft — which is the
  // branch that reports a failed read — before correcting itself.
  if (settings !== source) {
    setSource(settings)
    setDraft(settings === null ? null : draftOf(settings))
  }

  if (state.phase === 'loading') {
    return createElement(
      'p',
      { role: 'status', 'data-scrum-settings': 'loading' },
      t('settings.loading'),
    )
  }
  if (settings === null || draft === null) {
    return createElement(
      'div',
      { role: 'alert', 'data-scrum-settings': 'failed' },
      createElement('p', null, state.failure?.message ?? t('error.title')),
      createElement(
        'button',
        { type: 'button', 'data-scrum-settings-retry': true, onClick: props.actions.reload },
        t('backlog.conflict.refresh'),
      ),
    )
  }
  const patch = (change: Partial<Draft>): void => {
    setDraft({ ...draft, ...change })
  }
  return createElement(
    'form',
    {
      'data-scrum-settings': 'ready',
      onSubmit: (event: FormEvent) => {
        event.preventDefault()
        props.actions.save(toChanges(draft))
      },
    },
    banner(props),
    workflowSection(draft, patch, settings.statuses, props),
    checklistSection(draft, patch, props),
    numbersSection(draft, patch, props),
    capabilitiesSection(props),
    props.readOnly
      ? null
      : createElement(
          'button',
          { type: 'submit', 'data-scrum-settings-save': true, disabled: state.busy },
          state.busy ? t('project.saving') : t('project.save'),
        ),
  )
}

function banner(props: SettingsProps): ReactElement | null {
  const { t, state } = props
  if (state.failure !== null) {
    return createElement(
      'div',
      { role: 'alert', 'data-scrum-settings-failure': state.failure.kind },
      createElement('p', null, state.failure.message),
      // A conflict is the one failure with an answer: read it again and decide
      // against what is actually stored.
      state.failure.kind === 'conflict'
        ? createElement(
            'button',
            { type: 'button', 'data-scrum-settings-retry': true, onClick: props.actions.reload },
            t('backlog.conflict.refresh'),
          )
        : createElement(
            'button',
            { type: 'button', 'data-scrum-dismiss': true, onClick: props.actions.dismiss },
            t('backlog.dismiss'),
          ),
    )
  }
  return state.saved
    ? createElement('p', { role: 'status', 'data-scrum-settings-saved': true }, t('settings.saved'))
    : null
}

function section(id: string, title: string, ...children: readonly ReactElement[]): ReactElement {
  return createElement(
    'fieldset',
    { key: id, 'data-scrum-settings-section': id },
    createElement('legend', null, title),
    ...children,
  )
}

function textField(
  id: string,
  label: string,
  value: string,
  onChange: (next: string) => void,
  props: SettingsProps,
  type = 'text',
): ReactElement {
  return createElement(
    'p',
    { key: id },
    createElement('label', { htmlFor: id }, label),
    createElement('input', {
      id,
      type,
      value,
      disabled: props.readOnly,
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
  options: readonly { readonly value: Value; readonly label: MessageKey }[],
  onChange: (next: Value) => void,
  props: SettingsProps,
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
        disabled: props.readOnly,
        onChange: (event: { target: { value: string } }) => {
          onChange(event.target.value as Value)
        },
      },
      options.map((option) =>
        createElement('option', { key: option.value, value: option.value }, props.t(option.label)),
      ),
    ),
  )
}

/**
 * Renaming a column, which is the only part of the workflow that can change.
 *
 * The statuses themselves are shown and not editable: changing them changes
 * what every stored work item's status means, which is a migration rather than
 * an edit. A display name leaves the stored value alone.
 */
function workflowSection(
  draft: Draft,
  patch: (change: Partial<Draft>) => void,
  statuses: readonly WorkItemStatus[],
  props: SettingsProps,
): ReactElement {
  const { t } = props
  return section(
    'workflow',
    t('settings.workflow'),
    createElement('p', { 'data-scrum-hint': true }, t('settings.workflow.hint')),
    ...statuses.map((status) =>
      textField(
        `scrum-settings-name-${status}`,
        t(statusLabel(status)),
        draft.displayNames[status] ?? '',
        (next) => {
          const names = { ...draft.displayNames }
          // A cleared box means "no override", which is the field's absence.
          // Storing an empty string would rename the column to nothing.
          if (next.trim() === '') delete names[status]
          else names[status] = next
          patch({ displayNames: names })
        },
        props,
      ),
    ),
  )
}

function checklistSection(
  draft: Draft,
  patch: (change: Partial<Draft>) => void,
  props: SettingsProps,
): ReactElement {
  const { t } = props
  const box = (
    id: string,
    label: string,
    value: string,
    onChange: (next: string) => void,
  ): ReactElement =>
    createElement(
      'p',
      { key: id, 'data-scrum-area': true },
      createElement('label', { htmlFor: id }, label),
      createElement('textarea', {
        id,
        value,
        rows: 4,
        disabled: props.readOnly,
        onChange: (event: { target: { value: string } }) => {
          onChange(event.target.value)
        },
      }),
    )
  return section(
    'checklists',
    t('settings.checklists'),
    createElement('p', { 'data-scrum-hint': true }, t('settings.checklists.hint')),
    box(
      'scrum-settings-ready',
      t('settings.definitionOfReady'),
      draft.definitionOfReady,
      (next) => {
        patch({ definitionOfReady: next })
      },
    ),
    box('scrum-settings-done', t('settings.definitionOfDone'), draft.definitionOfDone, (next) => {
      patch({ definitionOfDone: next })
    }),
  )
}

function numbersSection(
  draft: Draft,
  patch: (change: Partial<Draft>) => void,
  props: SettingsProps,
): ReactElement {
  const { t } = props
  return section(
    'numbers',
    t('settings.numbers'),
    choice(
      'scrum-settings-estimation',
      t('settings.estimation'),
      draft.estimationMethod,
      ESTIMATION_METHODS,
      (next) => {
        patch({ estimationMethod: next })
      },
      props,
    ),
    textField(
      'scrum-settings-sprint-length',
      t('settings.sprintLength'),
      draft.sprintLengthInDays,
      (next) => {
        patch({ sprintLengthInDays: next })
      },
      props,
      'number',
    ),
    textField(
      'scrum-settings-wip',
      t('settings.wip'),
      draft.workInProgressLimit,
      (next) => {
        patch({ workInProgressLimit: next })
      },
      props,
      'number',
    ),
    createElement('p', { 'data-scrum-hint': true }, t('settings.wip.hint')),
    choice(
      'scrum-settings-velocity',
      t('settings.velocity'),
      draft.velocityBasis,
      VELOCITY_BASES,
      (next) => {
        patch({ velocityBasis: next })
      },
      props,
    ),
    textField(
      'scrum-settings-stalled',
      t('settings.stalled'),
      draft.stalledAfterDays,
      (next) => {
        patch({ stalledAfterDays: next })
      },
      props,
      'number',
    ),
  )
}

/**
 * What this installation provides.
 *
 * Named rather than left to be inferred from missing controls. "This edition
 * does not do that" and "you may not do that" are different answers, and a
 * page that showed neither would leave a user looking for a button that was
 * never going to be there.
 */
function capabilitiesSection(props: SettingsProps): ReactElement {
  const { t } = props
  const capabilities = props.authorization?.capabilities ?? []
  return section(
    'capabilities',
    t('settings.capabilities'),
    createElement(
      'ul',
      { 'data-scrum-capabilities': capabilities.length },
      capabilities.map((capability) =>
        createElement('li', { key: capability, 'data-scrum-capability': capability }, capability),
      ),
    ),
    createElement('p', { 'data-scrum-hint': true }, t('settings.capabilities.hint')),
  )
}
