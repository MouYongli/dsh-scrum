import { createElement, type ReactElement, type ReactNode } from 'react'
import type { SessionAccessState } from './session-controller.js'
import type { MessageKey, Translate } from './messages.js'
import { SCRUM_ACCESS_MODES, type AccessMode, type SessionDegradation } from './session.js'

export interface SessionAccessActions {
  readonly setMode: (mode: AccessMode) => void
  readonly dismiss: () => void
}

export interface SessionAccessProps {
  readonly state: SessionAccessState
  readonly actions: SessionAccessActions
  readonly t: Translate
}

const MODE_LABEL: Readonly<Record<AccessMode, MessageKey>> = {
  off: 'access.off',
  read: 'access.read',
  write: 'access.write',
}

const MODE_HINT: Readonly<Record<AccessMode, MessageKey>> = {
  off: 'access.off.hint',
  read: 'access.read.hint',
  write: 'access.write.hint',
}

const DEGRADATION: Readonly<Record<SessionDegradation, MessageKey>> = {
  archived: 'access.degraded.archived',
  roles: 'access.degraded.roles',
  binding: 'access.degraded.binding',
}

/**
 * What this conversation may do with the project's data.
 *
 * A radio group, not a menu: the three modes are one choice and all three have
 * to be visible, because the point of the control is that the user can see how
 * far they have opened the door without opening it further to find out.
 */
export function SessionAccessControl(props: SessionAccessProps): ReactElement {
  const { state, t } = props
  return createElement(
    'section',
    {
      'data-scrum-access': true,
      'aria-label': t('access.title'),
      'aria-busy': state.phase === 'loading' || state.busy,
    },
    createElement('h3', null, t('access.title')),
    createElement('p', null, t('access.body')),
    failureBanner(props),
    state.phase === 'loading'
      ? createElement('p', { 'data-scrum-loading': true }, t('access.loading'))
      : state.summary === null
        ? null
        : createElement(
            'div',
            { 'data-scrum-access-chosen': state.summary.chosen },
            selector(props, state.summary.chosen),
            effective(props),
            degradations(props),
          ),
  )
}

function failureBanner(props: SessionAccessProps): ReactNode {
  const { failure } = props.state
  if (failure === null) {
    return null
  }
  return createElement(
    'div',
    { role: 'alert', 'data-scrum-failure': failure.kind },
    createElement('p', null, props.t('error.title')),
    createElement('p', null, failure.message),
    createElement(
      'button',
      { type: 'button', onClick: props.actions.dismiss, 'data-scrum-dismiss': true },
      props.t('backlog.dismiss'),
    ),
  )
}

function selector(props: SessionAccessProps, chosen: AccessMode): ReactElement {
  const { t } = props
  return createElement(
    'fieldset',
    { 'data-scrum-access-modes': true },
    createElement('legend', null, t('access.title')),
    SCRUM_ACCESS_MODES.map((mode) => {
      const id = `scrum-access-${mode}`
      return createElement(
        'p',
        { key: mode },
        createElement('input', {
          id,
          type: 'radio',
          name: 'scrum-access',
          value: mode,
          checked: chosen === mode,
          disabled: props.state.busy,
          'aria-describedby': `${id}-hint`,
          onChange: () => {
            props.actions.setMode(mode)
          },
        }),
        createElement('label', { htmlFor: id }, t(MODE_LABEL[mode])),
        createElement('span', { id: `${id}-hint` }, t(MODE_HINT[mode])),
      )
    }),
  )
}

/**
 * What is in force, stated whether or not it matches the choice.
 *
 * Shown always rather than only when the two differ: a line that appeared only
 * on bad news would be a line users learn to stop looking for.
 */
function effective(props: SessionAccessProps): ReactNode {
  const summary = props.state.summary
  if (summary === null) {
    return null
  }
  return createElement(
    'p',
    { role: 'status', 'data-scrum-access-effective': summary.effective },
    `${props.t('access.effective')} ${props.t(MODE_LABEL[summary.effective])}`,
  )
}

function degradations(props: SessionAccessProps): ReactNode {
  const summary = props.state.summary
  if (summary === null || summary.degradations.length === 0) {
    return null
  }
  return createElement(
    'ul',
    { 'data-scrum-access-degraded': summary.degradations.length },
    summary.degradations.map((degradation) =>
      createElement('li', { key: degradation }, props.t(DEGRADATION[degradation])),
    ),
  )
}
