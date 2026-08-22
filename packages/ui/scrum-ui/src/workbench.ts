import {
  createElement,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react'
import type { CreateProjectInput, EntryView, ScrumClient } from './client.js'
import { createTranslate, type Translate } from './messages.js'
import { pageFor } from './pages.js'

/**
 * The Scrum workbench.
 *
 * It reaches nothing but the client it was given: no file, no socket, no
 * Harness service. That is what lets the same component render against a
 * workspace on disk and against a remote service, and it is the rule the
 * dependency boundary check enforces from outside.
 */
export interface WorkbenchProps {
  readonly client: ScrumClient
  readonly t?: Translate | undefined
  readonly onClose?: (() => void) | undefined
}

type Status =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly entry: EntryView }
  | { readonly kind: 'failed'; readonly message: string }

export function Workbench(props: WorkbenchProps): ReactElement {
  const t = props.t ?? createTranslate()
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const [creating, setCreating] = useState(false)

  const reload = useCallback(() => {
    let live = true
    setStatus({ kind: 'loading' })
    props.client
      .entry()
      .then((entry) => {
        if (live) {
          setStatus({ kind: 'ready', entry })
        }
      })
      .catch((error: unknown) => {
        if (live) {
          setStatus({ kind: 'failed', message: messageOf(error) })
        }
      })
    return () => {
      live = false
    }
  }, [props.client])

  useEffect(() => reload(), [reload])

  const create = useCallback(
    async (input: CreateProjectInput) => {
      setCreating(true)
      try {
        await props.client.createProject(input)
        reload()
      } catch (error: unknown) {
        setStatus({ kind: 'failed', message: messageOf(error) })
      } finally {
        setCreating(false)
      }
    },
    [props.client, reload],
  )

  return createElement(
    'section',
    {
      'data-scrum-workbench': true,
      role: 'dialog',
      'aria-label': t('workbench.title'),
      'aria-busy': status.kind === 'loading',
    },
    createElement(
      'header',
      null,
      createElement('h1', null, t('workbench.title')),
      props.onClose === undefined
        ? null
        : createElement(
            'button',
            { type: 'button', onClick: props.onClose, 'data-scrum-close': true },
            t('workbench.close'),
          ),
    ),
    body(status, t, creating, create),
  )
}

function body(
  status: Status,
  t: Translate,
  creating: boolean,
  create: (input: CreateProjectInput) => Promise<void>,
): ReactElement | null {
  if (status.kind === 'loading') {
    return null
  }
  if (status.kind === 'failed') {
    return createElement(
      'div',
      { role: 'alert', 'data-scrum-error': true },
      createElement('h2', null, t('error.title')),
      createElement('p', null, status.message),
    )
  }
  const page = pageFor(status.entry)
  return createElement(
    'div',
    { 'data-scrum-page': page.state },
    page.workspaceName === null
      ? null
      : createElement('p', { 'data-scrum-workspace': true }, page.workspaceName),
    createElement('h2', null, t(page.title)),
    createElement('p', null, t(page.body)),
    page.notice === null
      ? null
      : createElement('p', { role: 'status', 'data-scrum-moved': true }, t(page.notice)),
    page.project === null
      ? null
      : createElement(
          'p',
          { 'data-scrum-project': page.project.key },
          `${page.project.key} · ${page.project.name}`,
        ),
    page.action === null ? null : createElement(ProjectWizard, { t, creating, create }),
  )
}

interface WizardProps {
  readonly t: Translate
  readonly creating: boolean
  readonly create: (input: CreateProjectInput) => Promise<void>
}

/**
 * The first-run wizard.
 *
 * The key is not derived from the name. A project key becomes the prefix of
 * every work item identifier ever issued and cannot be changed afterwards, so
 * it is a decision the user makes rather than one a transliteration makes for
 * them — particularly with a Chinese project name, where any derivation would
 * be a guess.
 */
function ProjectWizard(props: WizardProps): ReactElement {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')

  function submit(event: FormEvent): void {
    event.preventDefault()
    void props.create({ name, key: key.toUpperCase(), description })
  }

  return createElement(
    'form',
    { onSubmit: submit, 'data-scrum-wizard': true },
    createElement('h3', null, props.t('wizard.title')),
    field('scrum-name', props.t('wizard.name'), name, setName, true),
    field('scrum-key', props.t('wizard.key'), key, setKey, true, props.t('wizard.keyHint')),
    field('scrum-description', props.t('wizard.description'), description, setDescription, false),
    createElement(
      'button',
      { type: 'submit', disabled: props.creating, 'data-scrum-submit': true },
      props.creating ? props.t('wizard.creating') : props.t('wizard.submit'),
    ),
  )
}

/** A labelled input. The label is bound by id, so a screen reader announces it. */
function field(
  id: string,
  label: string,
  value: string,
  onChange: (next: string) => void,
  required: boolean,
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
