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
import { toProjectKey } from '@dsh-scrum/scrum-domain'
import { createBacklogController } from './backlog-controller.js'
import { BacklogScreen } from './backlog-view.js'
import { createSprintController } from './sprint-controller.js'
import { SprintScreen } from './sprint-view.js'
import type {
  CreateProjectInput,
  RemoteOfferView,
  RemoteProfileView,
  ScrumClient,
} from './client.js'
import { createWorkbenchController, type WorkbenchState } from './controller.js'
import type { ScrumFailure } from './failure.js'
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
  /** Shell-owned title bar, such as the current Workspace switcher. */
  readonly header?: ReactNode | undefined
  readonly onCreate?: ((input: CreateProjectInput) => void) | undefined
  readonly onConnectTeam?: (() => void) | undefined
  readonly connectionSurface?: ReactNode | undefined
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
    props.header ??
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
    runtimeContext(props.state, t),
    body(props, t),
  )
}

function runtimeContext(state: WorkbenchState, t: Translate): ReactElement | null {
  if (state.kind !== 'ready' || state.entry.runtimeContext === undefined) {
    return null
  }
  const context = state.entry.runtimeContext
  return createElement(
    'dl',
    { 'data-scrum-runtime': context.edition, 'aria-label': t('runtime.edition') },
    createElement('dt', null, t('runtime.edition')),
    createElement('dd', null, t(`edition.${context.edition}`)),
    createElement('dt', null, t('runtime.service')),
    createElement('dd', { 'data-scrum-service': true }, context.serviceName),
    createElement('dt', null, t('runtime.tenant')),
    createElement('dd', { 'data-scrum-tenant': true }, context.tenantName),
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
  if (page.project !== null && props.surface !== undefined && props.surface !== null) {
    return createElement(
      'div',
      { 'data-scrum-page': page.state },
      page.notice === null
        ? null
        : createElement('p', { role: 'status', 'data-scrum-moved': true }, t(page.notice)),
      props.surface,
    )
  }
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
    page.action === null || state.failure === null ? null : refusal(state.failure, t),
    page.action === null
      ? null
      : createElement(ProjectWizard, {
          t,
          creating: state.creating,
          onCreate: props.onCreate,
        }),
    page.connectAction === null
      ? null
      : (props.connectionSurface ??
          createElement(TeamConnectionEntry, { t, onConnect: props.onConnectTeam })),
    page.project === null ? null : props.surface,
  )
}

function TeamConnectionEntry(props: {
  readonly t: Translate
  readonly onConnect?: (() => void) | undefined
}): ReactElement {
  const [opened, setOpened] = useState(false)
  return createElement(
    'section',
    { 'data-scrum-connect-entry': true },
    createElement(
      'button',
      {
        type: 'button',
        'data-scrum-connect': true,
        onClick: () => {
          setOpened(true)
          props.onConnect?.()
        },
      },
      props.t('state.unbound.connect'),
    ),
    opened
      ? createElement(
          'div',
          { role: 'region', 'aria-label': props.t('connect.title') },
          createElement('h3', null, props.t('connect.title')),
          createElement('p', null, props.t('connect.body')),
        )
      : null,
  )
}

function RemoteConnectionFlow(props: {
  readonly client: ScrumClient
  readonly t: Translate
  readonly onOpen?: (() => void) | undefined
  readonly onAttached: () => void
}): ReactElement {
  const [opened, setOpened] = useState(false)
  const [profiles, setProfiles] = useState<readonly RemoteProfileView[]>([])
  const [offer, setOffer] = useState<RemoteOfferView | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  async function open(): Promise<void> {
    setOpened(true)
    setFailure(null)
    props.onOpen?.()
    try {
      setProfiles(await props.client.remoteProfiles())
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : String(error))
    }
  }

  async function begin(connectionId: string): Promise<void> {
    setFailure(null)
    try {
      setOffer(await props.client.beginRemote(connectionId))
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : String(error))
    }
  }

  async function attach(projectId: string): Promise<void> {
    if (offer === null) return
    setFailure(null)
    try {
      await props.client.attachRemote(offer.connectionId, projectId)
      props.onAttached()
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : String(error))
    }
  }

  return createElement(
    'section',
    { 'data-scrum-connect-entry': true },
    createElement(
      'button',
      { type: 'button', 'data-scrum-connect': true, onClick: () => void open() },
      props.t('state.unbound.connect'),
    ),
    opened
      ? createElement(
          'div',
          { role: 'region', 'aria-label': props.t('connect.title') },
          createElement('h3', null, props.t('connect.title')),
          createElement('p', null, props.t('connect.body')),
          failure === null ? null : createElement('p', { role: 'alert' }, failure),
          offer === null
            ? profiles.map((profile) =>
                createElement(
                  'button',
                  {
                    key: profile.id,
                    type: 'button',
                    'data-scrum-remote-profile': profile.id,
                    onClick: () => void begin(profile.id),
                  },
                  profile.displayName,
                ),
              )
            : createElement(
                'div',
                { 'data-scrum-remote-offer': offer.edition },
                createElement('p', null, `${offer.serviceName} · ${offer.tenant.displayName}`),
                offer.projects.map((project) =>
                  createElement(
                    'button',
                    {
                      key: project.id,
                      type: 'button',
                      'data-scrum-remote-project': project.id,
                      onClick: () => void attach(project.id),
                    },
                    `${project.key} · ${project.name}`,
                  ),
                ),
              ),
        )
      : null,
  )
}

/**
 * A creation the host refused, shown above the form that caused it.
 *
 * Above rather than instead of: the form still holds the name, key and
 * description that were typed, and the next thing the user does is edit one of
 * them. The banner carries the host's own sentence — it is the only thing that
 * says which of them to edit.
 */
function refusal(failure: ScrumFailure, t: Translate): ReactElement {
  return createElement(
    'div',
    { role: 'alert', 'data-scrum-create-failure': failure.kind },
    createElement('p', null, t('error.title')),
    createElement('p', null, failure.message),
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
  const [rejected, setRejected] = useState(false)
  useDraftGuard(name !== '' || key !== '' || description !== '')

  function submit(event: FormEvent): void {
    event.preventDefault()
    const input = toCreateInput(name, key, description)
    if (!isProjectKey(input.key)) {
      setRejected(true)
      return
    }
    setRejected(false)
    props.onCreate?.(input)
  }

  return createElement(
    'form',
    { onSubmit: submit, 'data-scrum-wizard': true },
    createElement('h3', null, props.t('state.unbound.create')),
    field('scrum-name', props.t('wizard.name'), name, setName, true),
    field(
      'scrum-key',
      props.t('wizard.key'),
      key,
      (next) => {
        // Cleared as soon as the value changes: the message is about the key
        // that was submitted, and leaving it under a field the user is in the
        // middle of correcting says the correction is wrong too.
        setRejected(false)
        setKey(next)
      },
      true,
      props.t('wizard.keyHint'),
      rejected ? props.t('wizard.keyInvalid') : undefined,
    ),
    field('scrum-description', props.t('wizard.description'), description, setDescription, false),
    createElement(
      'button',
      { type: 'submit', disabled: props.creating, 'data-scrum-submit': true },
      props.creating ? props.t('wizard.creating') : props.t('wizard.submit'),
    ),
  )
}

/**
 * Whether the host would accept this key, asked before it is sent.
 *
 * The rule is read from the domain rather than spelled again here. A second
 * pattern in the interface is one that can drift from the one the store parses
 * against, and either direction of drift is a defect: a form that refuses a key
 * the host would take, or one that accepts a key the host will not.
 *
 * Asking here does not make the host's own check redundant — the Agent tools
 * and the remote adapter reach the same use case without passing this form.
 * What it changes is which sentence the user reads: a named field in their own
 * language instead of the channel's `payload for project.create is invalid`.
 */
function isProjectKey(key: string): boolean {
  try {
    toProjectKey(key)
    return true
  } catch {
    return false
  }
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

/**
 * A labelled input. The label is bound by id, so a screen reader announces it.
 *
 * A refusal is bound the same way and marks the input invalid, so it is read
 * out with the field rather than only being visible beside it. It is described
 * after the hint, which keeps the rule and the complaint about breaking it in
 * the order they were read.
 */
function field(
  id: string,
  label: string,
  value: string,
  onChange: (next: string) => void,
  required: boolean,
  hint?: string,
  error?: string,
): ReactElement {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const described = [hint === undefined ? null : hintId, error === undefined ? null : errorId]
    .filter((token): token is string => token !== null)
    .join(' ')
  return createElement(
    'p',
    { key: id },
    createElement('label', { htmlFor: id }, label),
    createElement('input', {
      id,
      value,
      required,
      'aria-describedby': described === '' ? undefined : described,
      'aria-invalid': error === undefined ? undefined : true,
      onChange: (event: { target: { value: string } }) => {
        onChange(event.target.value)
      },
    }),
    hint === undefined ? null : createElement('span', { id: hintId }, hint),
    error === undefined
      ? null
      : createElement('span', { id: errorId, role: 'alert', 'data-scrum-field-error': id }, error),
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

/** The screens a project has, and which one is showing. */
const SECTIONS = [
  { id: 'home', label: 'section.home' },
  { id: 'backlog', label: 'section.backlog' },
  { id: 'sprint', label: 'section.sprint' },
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
  readonly project: { readonly key: string; readonly name: string; readonly description: string }
  readonly onOpenAgent?: (() => void) | undefined
}): ReactElement {
  const [section, setSection] = useState<SectionId>('home')
  const [agentOpen, setAgentOpen] = useState(false)
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
      createElement(
        'button',
        {
          type: 'button',
          'data-scrum-agent': true,
          onClick: () => {
            setAgentOpen(true)
            props.onOpenAgent?.()
          },
        },
        props.t('agent.open'),
      ),
    ),
    agentOpen
      ? createElement('aside', { 'data-scrum-agent-panel': true }, props.t('agent.body'))
      : null,
    surfaceFor(section, props),
  )
}

function surfaceFor(
  section: SectionId,
  props: {
    readonly client: ScrumClient
    readonly t: Translate
    readonly readOnly: boolean
    readonly project: { readonly key: string; readonly name: string; readonly description: string }
  },
): ReactElement {
  switch (section) {
    case 'home':
      return createElement(ConnectedHome, props)
    case 'backlog':
      return createElement(ConnectedBacklog, props)
    case 'sprint':
      return createElement(ConnectedSprints, props)
  }
}

function ConnectedHome(props: {
  readonly client: ScrumClient
  readonly t: Translate
  readonly project: { readonly key: string; readonly name: string; readonly description: string }
}): ReactElement {
  const [authorization, setAuthorization] = useState<Awaited<
    ReturnType<ScrumClient['authorization']>
  > | null>(null)

  useEffect(() => {
    let current = true
    void props.client
      .authorization()
      .then((resolved) => {
        if (current) setAuthorization(resolved)
      })
      .catch(() => {
        if (current) setAuthorization(null)
      })
    return () => {
      current = false
    }
  }, [props.client])

  return createElement(
    'section',
    { 'data-scrum-home': true },
    createElement('p', { 'data-scrum-project': props.project.key }, props.project.key),
    createElement('h2', null, props.project.name),
    props.project.description === '' ? null : createElement('p', null, props.project.description),
    createElement('h3', null, props.t('home.title')),
    createElement('p', null, props.t('home.body')),
    authorization?.membership.mode === 'personal'
      ? createElement(
          'aside',
          { 'data-scrum-personal-owner': true },
          createElement('h3', null, props.t('membership.personal.title')),
          createElement('p', null, props.t('membership.personal.body')),
          createElement(
            'p',
            { 'data-scrum-owner-roles': true },
            authorization.membership.roles.join(', '),
          ),
        )
      : null,
  )
}

export interface ConnectedWorkbenchProps {
  readonly client: ScrumClient
  readonly t?: Translate | undefined
  readonly header?: ReactNode | undefined
  readonly onExit?: (() => void) | undefined
  readonly leaving?: boolean | undefined
  readonly onResume?: (() => void) | undefined
  readonly onDiscard?: (() => void) | undefined
  readonly onConnectTeam?: ((workspaceId: string) => void) | undefined
  readonly onOpenAgent?: ((workspaceId: string) => void) | undefined
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
  const connectWorkspaceId =
    state.kind === 'ready' && state.entry.state === 'unbound' ? state.entry.workspace.id : null
  const agentWorkspaceId =
    state.kind === 'ready' && (state.entry.state === 'bound' || state.entry.state === 'archived')
      ? state.entry.workspace.id
      : null
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
      header: props.header,
      onExit: props.onExit,
      leaving: props.leaving,
      onResume: props.onResume,
      onDiscard: props.onDiscard,
      onCreate: (input) => void controller.create(input),
      onConnectTeam:
        connectWorkspaceId === null ? undefined : () => props.onConnectTeam?.(connectWorkspaceId),
      connectionSurface:
        connectWorkspaceId === null
          ? undefined
          : createElement(RemoteConnectionFlow, {
              client: props.client,
              t,
              onOpen: () => props.onConnectTeam?.(connectWorkspaceId),
              onAttached: () => void controller.load(),
            }),
      surface:
        state.kind === 'ready' &&
        (state.entry.state === 'bound' || state.entry.state === 'archived')
          ? createElement(ProjectSurface, {
              client: props.client,
              t,
              readOnly: state.entry.state === 'archived',
              project: state.entry.project,
              onOpenAgent:
                agentWorkspaceId === null ? undefined : () => props.onOpenAgent?.(agentWorkspaceId),
            })
          : null,
    }),
  )
}
