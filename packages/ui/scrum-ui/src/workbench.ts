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
import { PERMISSION, toProjectKey } from '@dsh-scrum/scrum-domain'
import { createBacklogController } from './backlog-controller.js'
import { createDashboardController } from './dashboard-controller.js'
import { DashboardScreen } from './dashboard-view.js'
import { BacklogScreen } from './backlog-view.js'
import { createSprintController } from './sprint-controller.js'
import { SprintScreen } from './sprint-view.js'
import type {
  AuthorizationView,
  CreateProjectInput,
  EntryView,
  ProjectView,
  RemoteOfferView,
  RemoteProfileView,
  ScrumClient,
} from './client.js'
import { createWorkbenchController, type WorkbenchState } from './controller.js'
import type { ScrumFailure } from './failure.js'
import { DraftsProvider, NO_DRAFTS, useDraftGuard, type DraftRegistry } from './drafts.js'
import { createTranslate, type MessageKey, type Translate } from './messages.js'
import { DEFAULT_SORT } from './list.js'
import { WorkItemList } from './list-view.js'
import { pageFor } from './pages.js'
import {
  ANY_SPRINT,
  EMPTY_QUERY,
  UNPLANNED,
  toBacklogQuery,
  type WorkItemQuery,
} from './work-item-filter.js'

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
  readonly header?: ReactNode | ((entry: EntryView | null) => ReactNode) | undefined
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
    (typeof props.header === 'function'
      ? props.header(props.state.kind === 'ready' ? props.state.entry : null)
      : props.header) ??
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
  const content = createElement(
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
  if (page.state !== 'unbound') return content
  return createElement(
    'div',
    { 'data-scrum-surface': 'home', 'data-scrum-onboarding': true },
    createElement(
      'nav',
      { 'aria-label': t('workbench.title') },
      createElement(
        'button',
        {
          type: 'button',
          'aria-pressed': true,
          'data-scrum-section': 'home',
        },
        t('section.home'),
      ),
    ),
    content,
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
    area('scrum-description', props.t('wizard.description'), description, setDescription),
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

function area(
  id: string,
  label: string,
  value: string,
  onChange: (next: string) => void,
): ReactElement {
  return createElement(
    'p',
    { key: id, 'data-scrum-area': true },
    createElement('label', { htmlFor: id }, label),
    createElement('textarea', {
      id,
      value,
      onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    }),
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
  readonly query: WorkItemQuery
  readonly onQuery: (query: WorkItemQuery) => void
}): ReactElement {
  const controller = useMemo(() => createBacklogController(props.client), [props.client])
  const state = useSyncExternalStore(controller.subscribe, controller.state, controller.state)
  const { query } = props

  // The scope is this page's own: a backlog is the work in no sprint. The rest
  // of the narrowing is the surface's, and reaches here whichever page set it.
  useEffect(() => {
    void controller.setQuery(toBacklogQuery(query, UNPLANNED))
  }, [controller, query])

  return createElement(BacklogScreen, {
    state,
    query,
    t: props.t,
    readOnly: props.readOnly,
    actions: {
      narrow: props.onQuery,
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
 * The work item list, wired to a client.
 *
 * The same controller as the backlog, opened on the whole project rather than
 * on the unplanned work. Nothing about this page is Scrum-shaped: it answers
 * what is in the project, which is a question asked outside the ceremonies.
 */
function ConnectedItems(props: {
  readonly client: ScrumClient
  readonly t: Translate
  readonly query: WorkItemQuery
}): ReactElement {
  const controller = useMemo(() => createBacklogController(props.client, {}), [props.client])
  const state = useSyncExternalStore(controller.subscribe, controller.state, controller.state)
  const [sort, setSort] = useState(DEFAULT_SORT)
  const { query } = props

  useEffect(() => {
    void controller.setQuery(toBacklogQuery(query, ANY_SPRINT))
  }, [controller, query])

  return createElement(
    'section',
    { 'data-scrum-items': true },
    createElement('h3', null, props.t('items.title')),
    createElement(WorkItemList, {
      state,
      sort,
      t: props.t,
      actions: {
        sort: setSort,
        select: controller.select,
        refresh: () => void controller.load(),
      },
    }),
  )
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
      move: (item, status, resolution) => void controller.move(item, status, resolution),
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
 * The pages a project has, and which one is showing.
 *
 * Grouped by time: the backlog is about what is next, the board about what is
 * happening, the review about what happened, and the work item page carries no
 * Scrum ceremony at all. The order is the one `docs/product/scrum.md` 5.1
 * lists, which is the order somebody reads them in.
 *
 * The agent is not among them. It opens a conversation rather than a view of
 * the project, and this strip is about which projection of the project is
 * showing; it sits in the workbench header beside the way back.
 */
const SECTIONS = [
  { id: 'dashboard', label: 'section.dashboard' },
  { id: 'items', label: 'section.items' },
  { id: 'backlog', label: 'section.backlog' },
  { id: 'sprint', label: 'section.sprint' },
  { id: 'review', label: 'section.review' },
  { id: 'settings', label: 'section.settings' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/**
 * A page that names what it is for before it has anything to show.
 *
 * Not an empty frame: somebody who opens the review page before it exists
 * should read that reports and improvement actions land there, rather than
 * wonder whether the page failed to load.
 */
function Placeholder(props: {
  readonly t: Translate
  readonly id: SectionId
  readonly title: MessageKey
  readonly body: MessageKey
}): ReactElement {
  return createElement(
    'section',
    { 'data-scrum-placeholder': props.id },
    createElement('h3', null, props.t(props.title)),
    createElement('p', null, props.t(props.body)),
  )
}

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
  readonly project: ProjectView
  readonly onProjectUpdated: () => void
  readonly onOpenAgent?: (() => void) | undefined
}): ReactElement {
  const [section, setSection] = useState<SectionId>('dashboard')
  const [agentOpened, setAgentOpened] = useState(false)
  // Held here rather than by any page: narrowing to an epic on the list and
  // finding the backlog wide open again is the thing a shared filter is for.
  const [query, setQuery] = useState<WorkItemQuery>(EMPTY_QUERY)
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
            setAgentOpened(true)
            props.onOpenAgent?.()
          },
        },
        props.t('agent.open'),
      ),
    ),
    agentOpened
      ? createElement('section', { 'data-scrum-agent-panel': true }, props.t('agent.body'))
      : null,
    surfaceFor(section, { ...props, query, onQuery: setQuery }),
  )
}

function surfaceFor(
  section: SectionId,
  props: {
    readonly client: ScrumClient
    readonly t: Translate
    readonly readOnly: boolean
    readonly project: ProjectView
    readonly onProjectUpdated: () => void
    readonly query: WorkItemQuery
    readonly onQuery: (query: WorkItemQuery) => void
  },
): ReactElement {
  switch (section) {
    case 'dashboard':
      return createElement(ConnectedHome, props)
    case 'backlog':
      return createElement(ConnectedBacklog, props)
    case 'sprint':
      return createElement(ConnectedSprints, props)
    case 'items':
      return createElement(ConnectedItems, props)
    case 'review':
      return createElement(Placeholder, {
        t: props.t,
        id: 'review',
        title: 'review.title',
        body: 'review.body',
      })
    case 'settings':
      return createElement(ConnectedSettings, props)
  }
}

/**
 * What the current user may do here, resolved once per client.
 *
 * Two pages ask, and the answer is about the person and the project rather
 * than about either page, so it is read the same way in both instead of one
 * page passing it to the other through a shape neither owns.
 */
function useAuthorization(client: ScrumClient): AuthorizationView | null {
  const [authorization, setAuthorization] = useState<AuthorizationView | null>(null)
  useEffect(() => {
    let current = true
    void client
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
  }, [client])
  return authorization
}

/**
 * The dashboard, wired to a client.
 *
 * Read-only. Changing the project's own details is a settings act, and a
 * heading somebody edits in passing on the page they open every morning is
 * the heading that gets changed by accident.
 */
function ConnectedHome(props: {
  readonly client: ScrumClient
  readonly t: Translate
  readonly project: ProjectView
}): ReactElement {
  const controller = useMemo(() => createDashboardController(props.client), [props.client])
  const state = useSyncExternalStore(controller.subscribe, controller.state, controller.state)

  useEffect(() => {
    void controller.load()
  }, [controller])

  return createElement(DashboardScreen, {
    state,
    project: props.project,
    t: props.t,
    actions: { refresh: () => void controller.load() },
  })
}

/** The settings page, which for now is the project's own details. */
function ConnectedSettings(props: {
  readonly client: ScrumClient
  readonly t: Translate
  readonly project: ProjectView
  readonly readOnly: boolean
  readonly onProjectUpdated: () => void
}): ReactElement {
  const authorization = useAuthorization(props.client)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(props.project.name)
  const [description, setDescription] = useState(props.project.description)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const dirty = name !== props.project.name || description !== props.project.description
  useDraftGuard(editing && dirty)

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (props.project.revision === undefined) return
    setSaving(true)
    setFailure(null)
    try {
      await props.client.updateProject({
        expectedRevision: props.project.revision,
        changes: { name, description },
      })
      setEditing(false)
      props.onProjectUpdated()
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const mayEdit =
    !props.readOnly &&
    props.project.revision !== undefined &&
    authorization?.permissions.includes(PERMISSION.projectConfigure) === true

  return createElement(
    'section',
    { 'data-scrum-settings': true },
    createElement('h3', null, props.t('settings.title')),
    createElement('p', null, props.t('settings.body')),
    createElement(
      'div',
      { 'data-scrum-project-heading': true },
      createElement('h4', null, props.project.name),
      createElement('p', { 'data-scrum-project': props.project.key }, props.project.key),
      !mayEdit || editing
        ? null
        : createElement(
            'button',
            { type: 'button', 'data-scrum-project-edit': true, onClick: () => setEditing(true) },
            props.t('project.edit'),
          ),
    ),
    editing
      ? createElement(
          'form',
          { 'data-scrum-project-form': true, onSubmit: (event: FormEvent) => void save(event) },
          field('scrum-project-name', props.t('wizard.name'), name, setName, true),
          area(
            'scrum-project-description',
            props.t('wizard.description'),
            description,
            setDescription,
          ),
          failure === null ? null : createElement('p', { role: 'alert' }, failure),
          createElement(
            'div',
            { 'data-scrum-project-actions': true },
            createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  setName(props.project.name)
                  setDescription(props.project.description)
                  setFailure(null)
                  setEditing(false)
                },
              },
              props.t('project.cancel'),
            ),
            createElement(
              'button',
              { type: 'submit', disabled: saving || !dirty, 'data-scrum-project-save': true },
              saving ? props.t('project.saving') : props.t('project.save'),
            ),
          ),
        )
      : props.project.description === ''
        ? null
        : createElement('p', { 'data-scrum-project-description': true }, props.project.description),
    // Membership belongs on the page that configures the project rather than
    // on the one somebody opens every morning. Community has no `rbac`
    // capability, so this says who the owner is and why there is nothing to
    // edit — a role editor that refused every save would be worse.
    authorization?.membership.mode === 'personal'
      ? createElement(
          'aside',
          { 'data-scrum-personal-owner': true },
          createElement('h4', null, props.t('membership.personal.title')),
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
  readonly header?: WorkbenchProps['header']
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
              onProjectUpdated: () => void controller.load(),
              onOpenAgent:
                agentWorkspaceId === null ? undefined : () => props.onOpenAgent?.(agentWorkspaceId),
            })
          : null,
    }),
  )
}
