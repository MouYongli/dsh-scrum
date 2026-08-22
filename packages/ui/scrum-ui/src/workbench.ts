import {
  createElement,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createBacklogController } from './backlog-controller.js'
import { BacklogScreen } from './backlog-view.js'
import { createSessionAccessController } from './session-controller.js'
import { SessionAccessControl } from './session-view.js'
import { createSprintController } from './sprint-controller.js'
import { SprintScreen } from './sprint-view.js'
import type { CreateProjectInput, ScrumClient } from './client.js'
import { createWorkbenchController, type WorkbenchState } from './controller.js'
import { DraftsProvider, NO_DRAFTS, useDraftGuard, type DraftRegistry } from './drafts.js'
import { createTranslate, type Translate } from './messages.js'
import { pageFor } from './pages.js'

/**
 * The Scrum workbench, over a state somebody else resolved.
 *
 * Pure: it reaches no file, no socket and no Harness service, which is what
 * lets one component render against a workspace on disk and against a remote
 * service. It is also why every state it can show is renderable in a test
 * without waiting for anything.
 */
export interface WorkbenchProps {
  readonly state: WorkbenchState
  readonly t?: Translate | undefined
  readonly onCreate?: ((input: CreateProjectInput) => void) | undefined
  /** Back to the conversation. Absent leaves the surface with no way out. */
  readonly onExit?: (() => void) | undefined
  /** True while a leave is waiting on an answer about unsaved input. */
  readonly leaving?: boolean | undefined
  readonly onResume?: (() => void) | undefined
  readonly onDiscard?: (() => void) | undefined
  /**
   * What a project surface shows once a workspace is attached to one. Handed
   * in rather than built here, so this component stays renderable against any
   * state without a client behind it.
   */
  readonly surface?: ReactNode | undefined
}

export function Workbench(props: WorkbenchProps): ReactElement {
  const t = props.t ?? createTranslate()
  return createElement(
    'section',
    {
      'data-scrum-workbench': true,
      // A region rather than a dialog: Scrum is one of the shell's two working
      // modes, so the sidebar beside it stays live and is meant to be used.
      // `dialog` without `aria-modal` would announce an interruption that the
      // surface does not actually impose.
      role: 'region',
      tabIndex: -1,
      'aria-label': t('workbench.title'),
      'aria-busy': props.state.kind === 'loading',
    },
    createElement(
      'header',
      null,
      createElement('h1', null, t('workbench.title')),
      props.onExit === undefined
        ? null
        : createElement(
            'button',
            { type: 'button', onClick: props.onExit, 'data-scrum-back': true },
            t('workbench.back'),
          ),
    ),
    props.leaving === true ? leaveQuestion(props, t) : null,
    body(props, t),
  )
}

/**
 * The question a leave raises when something is half typed.
 *
 * Drawn over the workbench rather than in place of it, and the forms behind it
 * stay mounted and usable: they are holding the drafts this is about, and the
 * quickest answer for someone who meant to save is to go and save, which
 * settles the question without them answering it.
 *
 * An alert dialog because this one really is an interruption — unlike the
 * workbench frame around it, which is a mode.
 */
function leaveQuestion(props: WorkbenchProps, t: Translate): ReactElement {
  return createElement(
    'div',
    { 'data-scrum-leave': true, role: 'alertdialog', 'aria-label': t('leave.title') },
    createElement('h2', null, t('leave.title')),
    createElement('p', null, t('leave.body')),
    createElement(
      'button',
      { type: 'button', onClick: props.onResume, 'data-scrum-leave-resume': true },
      t('leave.resume'),
    ),
    createElement(
      'button',
      { type: 'button', onClick: props.onDiscard, 'data-scrum-leave-discard': true },
      t('leave.discard'),
    ),
  )
}

function body(props: WorkbenchProps, t: Translate): ReactElement | null {
  const state = props.state
  if (state.kind === 'loading') {
    return null
  }
  if (state.kind === 'failed') {
    return createElement(
      'div',
      { role: 'alert', 'data-scrum-error': true },
      createElement('h2', null, t('error.title')),
      createElement('p', null, state.message),
    )
  }
  const page = pageFor(state.entry)
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
    page.action === null
      ? null
      : createElement(ProjectWizard, {
          t,
          creating: state.creating,
          onCreate: props.onCreate,
        }),
    page.project === null ? null : props.surface,
  )
}

interface WizardProps {
  readonly t: Translate
  readonly creating: boolean
  readonly onCreate?: ((input: CreateProjectInput) => void) | undefined
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
  useDraftGuard(name !== '' || key !== '' || description !== '')

  function submit(event: FormEvent): void {
    event.preventDefault()
    props.onCreate?.(toCreateInput(name, key, description))
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

/**
 * What the three fields mean as a command.
 *
 * The key is upper-cased rather than rejected in lower case: the identifier
 * grammar only admits upper case, and a form that refused `scr` would be
 * refusing a spelling of the answer it wanted. Nothing else is normalized —
 * the name is the user's.
 */
export function toCreateInput(name: string, key: string, description: string): CreateProjectInput {
  return { name, key: key.toUpperCase(), description }
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

/**
 * The backlog, wired to a client.
 *
 * A surface of its own rather than a branch inside the workbench: it has its
 * own reads, its own failures and its own place, and folding it into the
 * workbench controller would make one state machine responsible for two
 * screens that fail independently.
 */
function ConnectedBacklog(props: {
  readonly client: ScrumClient
  readonly t: Translate
  readonly readOnly: boolean
}): ReactElement {
  const controller = useMemo(() => createBacklogController(props.client), [props.client])
  const state = useSyncExternalStore(controller.subscribe, controller.state, controller.state)

  useEffect(() => {
    void controller.load()
  }, [controller])

  return createElement(BacklogScreen, {
    state,
    t: props.t,
    readOnly: props.readOnly,
    actions: {
      query: (query) => void controller.setQuery(query),
      group: controller.setGrouping,
      select: controller.select,
      refresh: () => void controller.load(),
      dismiss: controller.dismiss,
      create: (input) => void controller.create(input),
      edit: (command) => void controller.edit(command),
      criterion: (command) => void controller.setCriterion(command),
      rank: (command) => void controller.rank(command),
      parent: (command) => void controller.setParent(command),
      dependency: (command) => void controller.setDependency(command),
      block: (command) => void controller.block(command),
    },
  })
}

/**
 * The sprint screen, wired to a client. A controller of its own for the same
 * reason the backlog has one.
 */
function ConnectedSprints(props: {
  readonly client: ScrumClient
  readonly t: Translate
  readonly readOnly: boolean
}): ReactElement {
  const controller = useMemo(() => createSprintController(props.client), [props.client])
  const state = useSyncExternalStore(controller.subscribe, controller.state, controller.state)

  useEffect(() => {
    void controller.load()
  }, [controller])

  return createElement(SprintScreen, {
    state,
    t: props.t,
    readOnly: props.readOnly,
    actions: {
      select: (sprintId) => void controller.select(sprintId),
      create: (input) => void controller.create(input),
      plan: (items, into) => void controller.plan(items, into),
      move: (item, status) => void controller.move(item, status),
      detail: controller.openDetail,
      refresh: () => void controller.load(),
      dismiss: controller.dismiss,
      edit: (command) => void controller.edit(command),
      criterion: (command) => void controller.setCriterion(command),
      parent: (command) => void controller.setParent(command),
      dependency: (command) => void controller.setDependency(command),
      block: (command) => void controller.block(command),
      ask: controller.ask,
      cancel: controller.cancel,
      start: () => void controller.start(),
      close: (resultSummary, dispositions) => void controller.close(resultSummary, dispositions),
    },
  })
}

/**
 * The session access control, wired to a client.
 *
 * `isBound` is read on every answer rather than captured once: a workspace can
 * lose its project while the workbench is open, and a session that reaches
 * nothing has to say the binding is why rather than blaming the mode.
 */
function ConnectedAccess(props: {
  readonly client: ScrumClient
  readonly t: Translate
  readonly isBound: () => boolean
}): ReactElement {
  const controller = useMemo(
    () => createSessionAccessController(props.client, props.isBound),
    [props.client, props.isBound],
  )
  const state = useSyncExternalStore(controller.subscribe, controller.state, controller.state)

  useEffect(() => {
    void controller.load()
  }, [controller])

  return createElement(SessionAccessControl, {
    state,
    t: props.t,
    actions: {
      setMode: (mode) => void controller.setMode(mode),
      dismiss: controller.dismiss,
    },
  })
}

/** The screens a project has, and which one is showing. */
const SECTIONS = [
  { id: 'backlog', label: 'section.backlog' },
  { id: 'sprint', label: 'section.sprint' },
  { id: 'access', label: 'section.access' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/**
 * The project surface: a tab strip over two screens.
 *
 * Each screen keeps its own controller, mounted only while it is showing. The
 * board and the backlog read overlapping data, and a hidden screen that went
 * on refreshing would spend a user's disk and then show them a list assembled
 * before the write they just made.
 */
function ProjectSurface(props: {
  readonly client: ScrumClient
  readonly t: Translate
  readonly readOnly: boolean
  readonly isBound: () => boolean
}): ReactElement {
  const [section, setSection] = useState<SectionId>('backlog')
  return createElement(
    'div',
    { 'data-scrum-surface': section },
    createElement(
      'nav',
      { 'aria-label': props.t('workbench.title') },
      SECTIONS.map((entry) =>
        createElement(
          'button',
          {
            key: entry.id,
            type: 'button',
            'aria-pressed': section === entry.id,
            'data-scrum-section': entry.id,
            onClick: () => {
              setSection(entry.id)
            },
          },
          props.t(entry.label),
        ),
      ),
    ),
    surfaceFor(section, props),
  )
}

function surfaceFor(
  section: SectionId,
  props: {
    readonly client: ScrumClient
    readonly t: Translate
    readonly readOnly: boolean
    readonly isBound: () => boolean
  },
): ReactElement {
  switch (section) {
    case 'backlog':
      return createElement(ConnectedBacklog, props)
    case 'sprint':
      return createElement(ConnectedSprints, props)
    case 'access':
      return createElement(ConnectedAccess, props)
  }
}

export interface ConnectedWorkbenchProps {
  readonly client: ScrumClient
  readonly t?: Translate | undefined
  readonly onExit?: (() => void) | undefined
  readonly leaving?: boolean | undefined
  readonly onResume?: (() => void) | undefined
  readonly onDiscard?: (() => void) | undefined
  /**
   * Where the forms report input the user has not saved. Handed in rather
   * than created here, because whoever decides that leaving needs a question
   * has to be reading the same answers.
   */
  readonly drafts?: DraftRegistry | undefined
}

/**
 * The workbench wired to a client. The only piece that waits for anything, and
 * it holds no rendering decisions of its own.
 */
export function ConnectedWorkbench(props: ConnectedWorkbenchProps): ReactElement {
  const controller = useMemo(() => createWorkbenchController(props.client), [props.client])
  const state = useSyncExternalStore(controller.subscribe, controller.state, controller.state)
  const isBound = useMemo(() => {
    return (): boolean => {
      const current = controller.state()
      return (
        current.kind === 'ready' &&
        (current.entry.state === 'bound' || current.entry.state === 'archived')
      )
    }
  }, [controller])

  useEffect(() => {
    void controller.load()
  }, [controller])

  const t = props.t ?? createTranslate()
  return createElement(
    DraftsProvider,
    { registry: props.drafts ?? NO_DRAFTS },
    createElement(Workbench, {
      state,
      t: props.t,
      onExit: props.onExit,
      leaving: props.leaving,
      onResume: props.onResume,
      onDiscard: props.onDiscard,
      onCreate: (input) => void controller.create(input),
      surface:
        state.kind === 'ready' &&
        (state.entry.state === 'bound' || state.entry.state === 'archived')
          ? createElement(ProjectSurface, {
              client: props.client,
              t,
              readOnly: state.entry.state === 'archived',
              isBound,
            })
          : null,
    }),
  )
}
