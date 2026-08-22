/**
 * Browser half of the Scrum plugin. It is not imported by the host: the module
 * loader serves this bundle to the web shell, which executes it only to
 * register a factory and runs the body when the module is first required.
 *
 * It registers two things: an entry in the sidebar footer, and the workbench
 * in the root-level overlay. Everything the workbench shows comes from the
 * client interface it is handed — this file owns the wiring, not the screens.
 *
 * @module @dsh-scrum/scrum-harness-client/client
 */
import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type MutableRefObject,
} from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Pulls in the slot map augmentations that declare the two slots used here.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ScrumScope } from '@dsh-scrum/scrum-api-contract'
import {
  ConnectedWorkbench,
  SCRUM_NAMESPACE,
  createTranslate,
  createDraftRegistry,
  createScrumModeStore,
  disconnectedClient,
  type DraftRegistry,
  type ScrumClient,
  type ScrumModeStore,
  type ShellMode,
} from '@dsh-scrum/scrum-ui'
import { createTransportClient, type RpcCall } from './transport.js'

export const name = 'scrum-harness-client'

/**
 * What this entry needs from the shell.
 *
 * Declaring them keeps the plugin pending rather than registering into
 * surfaces that are not there. `connection` carries the channel the workbench
 * talks to the host over; `workspaces` and `sessions` are where the selection
 * lives, and the selection is what every call is scoped by — the host holds
 * none of its own.
 */
export const inject = ['slots', 'connection', 'workspaces', 'sessions']

/** Identifier the sidebar and the overlay address these registrations by. */
const ENTRY_ID = 'scrum'

const EMPTY_WORKSPACE_SNAPSHOT = { items: [], recentWorkspaceId: undefined } as const
const EMPTY_SESSION_SNAPSHOT = { current: undefined, phase: undefined } as const

/**
 * Configuration the composing edition supplies.
 *
 * The client is a browser bundle and cannot open a workspace itself, so the
 * thing that can reaches it from outside. Without one the workbench still
 * opens and reports that it is not connected, which is a state a user can see
 * and report rather than an entry that does nothing when clicked.
 */
export interface ScrumClientConfig {
  readonly client?: ScrumClient | undefined
  readonly store?: ScrumModeStore | undefined
  readonly drafts?: DraftRegistry | undefined
}

/** Reads the mode without owning it, so both registrations see one answer. */
function useMode(store: ScrumModeStore): ShellMode {
  return useSyncExternalStore(store.subscribe, store.mode, store.mode)
}

/** Whether a leave is currently waiting on an answer about unsaved input. */
function useLeaving(store: ScrumModeStore): boolean {
  return useSyncExternalStore(store.subscribe, store.leaving, store.leaving)
}

/**
 * The sidebar's own selected row.
 *
 * Scrum is a mode the sidebar switches to, so its entry has to look selected
 * the way a session row does. Taken from the shell's palette rather than
 * written down: the entry inherits the shell's foreground, and a literal
 * would pair a light band with whatever text colour the active theme chose.
 * The fallback is derived from that inherited colour for the same reason —
 * `Highlight`, the system keyword, is only legible against `HighlightText`.
 */
const SIDEBAR_SELECTED =
  'var(--dsw-specific-sidebar-nav-item-active, color-mix(in srgb, currentColor 10%, transparent))'

/**
 * Sidebar footer entry. The slot owner supplies only the column state: `wide`
 * is the expanded sidebar, otherwise the 56px rail, where the label has no
 * room and the entry has to fall back to its icon.
 */
function entryComponent(store: ScrumModeStore): (props: { wide: boolean }) => ReactElement {
  const t = createTranslate()
  return function ScrumEntry(props: { wide: boolean }): ReactElement {
    const showing = useMode(store) === 'scrum'
    return createElement(
      'button',
      {
        type: 'button',
        'data-scrum-entry': ENTRY_ID,
        'aria-pressed': showing,
        // What the next click does, which is the opposite of the state the
        // pressed bit reports.
        'aria-label': showing ? t('entry.leave') : t('entry.open'),
        title: t('entry.label'),
        onClick: () => {
          store.toggle()
        },
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '6px 8px',
          borderRadius: '6px',
          background: showing ? SIDEBAR_SELECTED : 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          font: 'inherit',
        },
      },
      createElement('span', { 'aria-hidden': true }, '▦'),
      props.wide ? createElement('span', null, t('entry.label')) : null,
    )
  }
}

/**
 * The shell's own page background.
 *
 * The overlay covers the whole shell, so it has to bring a background of its
 * own or the conversation shows through it. That background must come from the
 * shell's palette rather than a literal: the text colour is inherited, and a
 * fixed one pairs a light surface with whatever foreground the active theme
 * chose. `Canvas` is the system keyword, so even a shell that publishes no
 * tokens at all still gets a pair that agrees.
 */
const SHELL_BACKGROUND = 'var(--dsw-alias-bg-base, Canvas)'

/**
 * Where the sidebar ends, measured rather than read from the slot.
 *
 * `shell.overlay` is declared with no owner props, `ctx.layout` exposes only
 * panel transitions, and the frame writes its column widths as an inline
 * `grid-template-columns` rather than a custom property. Nothing in the
 * contract can answer this, and the shipped geometry — the workbench covers
 * the conversation and the details, starting at the sidebar's right edge — is
 * not expressible without it.
 *
 * Both ends of the measurement are elements this plugin owns. The sidebar
 * entry is ours and always renders, degrading to an icon on the collapsed
 * rail, so walking up from it to the frame's direct child names the sidebar
 * column without touching a host class name or component. A walk that does not
 * arrive returns no offset, and the overlay covers the frame as it did before.
 *
 * @param overlay - the overlay's own element, once mounted.
 * @returns the offset in the overlay layer's own coordinates.
 */
function sidebarColumn(overlay: HTMLElement): { layer: Element; column: HTMLElement } | null {
  const layer = overlay.closest('[data-shell-overlay]')
  const frame = layer?.parentElement
  const entry = overlay.ownerDocument.querySelector<HTMLElement>(`[data-scrum-entry="${ENTRY_ID}"]`)
  if (layer === null || frame === null || frame === undefined || entry === null) {
    return null
  }
  let column: HTMLElement | null = entry
  while (column !== null && column.parentElement !== frame) {
    column = column.parentElement
  }
  return column === null ? null : { layer, column }
}

function measureSidebar(overlay: HTMLElement): number {
  const found = sidebarColumn(overlay)
  if (found === null) {
    return 0
  }
  const right = found.column.getBoundingClientRect().right
  return Math.max(0, right - found.layer.getBoundingClientRect().left)
}

/**
 * The measured offset, kept current.
 *
 * The sidebar is drag-resizable and collapsible, so a width read once is wrong
 * by the next frame. Observing the column itself catches both, and the window
 * covers the case where the frame moves without the column resizing. A shell
 * without `ResizeObserver` still gets the mount-time measurement rather than
 * no overlay at all.
 */
function useSidebarInset(showing: boolean): {
  readonly ref: (element: HTMLElement | null) => void
  readonly inset: number
  readonly element: { readonly current: HTMLElement | null }
} {
  const [inset, setInset] = useState(0)
  const element = useRef<HTMLElement | null>(null)

  const measure = useCallback(() => {
    const current = element.current
    setInset(current === null ? 0 : measureSidebar(current))
  }, [])

  const ref = useCallback(
    (next: HTMLElement | null) => {
      element.current = next
      measure()
    },
    [measure],
  )

  useEffect(() => {
    const current = element.current
    if (!showing || current === null) {
      return undefined
    }
    // Again here, not only in the ref: the ref runs during the commit, and the
    // sidebar entry is a second registration that may not have mounted yet.
    // Effects run after the whole commit, so by now both are in the document.
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const observer = new ResizeObserver(measure)
    const found = sidebarColumn(current)
    // The column itself, for a drag or a collapse; the overlay, for everything
    // that moves the columns without resizing the one being watched.
    observer.observe(current)
    if (found !== null) {
      observer.observe(found.column)
    }
    current.ownerDocument.defaultView?.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      current.ownerDocument.defaultView?.removeEventListener('resize', measure)
    }
  }, [showing, measure])

  return { ref, inset, element }
}

/**
 * Escape, as the other way back to the conversation.
 *
 * Listens on the document that owns the overlay rather than the overlay
 * itself: entering Scrum from the sidebar leaves the focus on the entry, and a
 * listener bound to the workbench would answer only after the user had clicked
 * into it. Reaching that document through this plugin's own element keeps the
 * hook right in a shell that renders the frame somewhere other than the
 * ambient document.
 *
 * Three events that look like Escape and are not:
 *
 * - An input method's candidate window closes on Escape, and the product's
 *   copy is Chinese with text inputs on every form. Leaving Scrum because
 *   somebody dismissed a candidate list would be unusable.
 * - Something nested may already have answered, which is what
 *   `defaultPrevented` reports.
 * - The listener is on the bubble phase for the same reason: capturing would
 *   take Escape away from those inputs before they ever saw it.
 */
function useEscape(
  active: boolean,
  element: { readonly current: HTMLElement | null },
  onEscape: () => void,
): void {
  useEffect(() => {
    const owner = element.current?.ownerDocument
    if (!active || owner === undefined) {
      return undefined
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') {
        return
      }
      // `isComposing` is the standard bit; 229 is what a browser that does not
      // set it reports for a key the input method is still holding.
      if (event.isComposing || event.keyCode === 229) {
        return
      }
      if (event.defaultPrevented) {
        return
      }
      event.preventDefault()
      onEscape()
    }
    owner.addEventListener('keydown', onKeyDown)
    return () => {
      owner.removeEventListener('keydown', onKeyDown)
    }
  }, [active, element, onEscape])
}

/**
 * The shell services this entry reads, as it reads them.
 *
 * Written structurally because the browser half of the connection publishes no
 * Cordis augmentation — the shipped one describes the node half's handle — so
 * the concrete types are not reachable from a browser plugin. Narrow on
 * purpose: what is written down here is the whole of what this plugin assumes
 * about the shell, and a shell that stops providing any of it is answered by
 * the disconnected client rather than by a crash.
 */
interface ShellServices {
  readonly connection?: { readonly rpc: { call: RpcCall } }
  readonly workspaces?: {
    readonly list: {
      getSnapshot(): {
        readonly items: readonly {
          readonly workspaceId: string
          readonly sessionIds: readonly string[]
          readonly title?: string | undefined
          readonly path?: string | undefined
        }[]
        readonly recentWorkspaceId?: string | undefined
      }
      subscribe(listener: () => void): () => void
    }
    startSession(workspaceId?: string): void
  }
  readonly sessions?: {
    readonly list: {
      getSnapshot(): {
        readonly current?: string | undefined
        readonly phase?: string | undefined
      }
      subscribe(listener: () => void): () => void
    }
  }
}

/**
 * Which workspace and session the window is showing, read on every call.
 *
 * The workspace is the one accounting for the open session rather than a
 * selection of its own: that is what the sidebar highlights, and reading it
 * from the session means the two can never disagree. With no session open the
 * most recent workspace is the answer, which is the one the shell would
 * connect a new session to.
 */
function readScope(shell: ShellServices): ScrumScope {
  const sessionId = shell.sessions?.list.getSnapshot().current ?? null
  const workspaces = shell.workspaces?.list.getSnapshot()
  const owning = workspaces?.items.find(
    (workspace) => sessionId !== null && workspace.sessionIds.includes(sessionId),
  )
  return {
    workspaceId:
      sessionId === null ? (workspaces?.recentWorkspaceId ?? null) : (owning?.workspaceId ?? null),
    sessionId,
  }
}

/**
 * The workspace the workbench is showing, as something to key it by.
 *
 * A Scrum project belongs to a workspace, so a workbench still showing the
 * previous one's backlog after the shell moved would be showing another
 * project's work. Remounting is the whole of the reload: the surface loads
 * once per mount and holds nothing worth carrying across a workspace it no
 * longer belongs to.
 *
 * Both lists are watched because the answer is derived from both — which
 * workspace accounts for the open session — and either can move without the
 * other. In a shell where changing workspace always opens a session, the
 * session exit gets there first and this is the belt: it earns its keep the
 * moment the shell can change workspace without changing session.
 */
function useWorkspaceKey(shell: ShellServices): string {
  const [key, setKey] = useState(() => readScope(shell).workspaceId ?? '')

  useEffect(() => {
    function read(): void {
      setKey(readScope(shell).workspaceId ?? '')
    }
    // Again here: the services may have answered differently between the
    // first render and the commit that subscribed to them.
    read()
    const stops = [shell.workspaces?.list.subscribe(read), shell.sessions?.list.subscribe(read)]
    return () => {
      for (const stop of stops) {
        stop?.()
      }
    }
  }, [shell])

  return key
}

/**
 * Leaves Scrum when the shell puts another session on screen.
 *
 * The shell publishes no event for "the user picked a session": the current
 * selection riding `sessions.list` is the only observable, and clicking a
 * session row, starting a new session and connecting a workspace all reach it
 * the same way — `startSession` connects a workspace and opens the resulting
 * session, or clears the selection when there is no workspace at all. So one
 * rule covers all three entry points, and Scrum needs no knowledge of which
 * button was pressed.
 *
 * Two changes are deliberately not navigations. A list that has not finished
 * arriving is still assembling its baseline, and the shell's own startup
 * selection — the first session it puts on screen after boot — is the shell
 * catching up rather than the user going somewhere. Neither may eject someone
 * who opened Scrum while that was still happening.
 *
 * What it cannot see: re-picking the session that is already current moves
 * nothing, so the workbench stays. The contract offers nothing finer.
 */
function useSessionExit(
  shell: ShellServices,
  store: ScrumModeStore,
  switchingTo: MutableRefObject<string | null>,
): void {
  useEffect(() => {
    const list = shell.sessions?.list
    if (list === undefined) {
      return undefined
    }
    const first = list.getSnapshot()
    let seen = first.current
    let everSelected = first.current !== undefined
    return list.subscribe(() => {
      const now = list.getSnapshot()
      if (now.phase !== 'ready') {
        seen = now.current
        return
      }
      const moved = now.current !== seen
      const startup = !everSelected && now.current !== undefined
      seen = now.current
      everSelected = everSelected || now.current !== undefined
      if (!moved || startup) {
        return
      }
      const target = switchingTo.current
      if (target !== null) {
        switchingTo.current = null
        const selectedWorkspace = shell.workspaces?.list
          .getSnapshot()
          .items.find((workspace) => workspace.sessionIds.includes(now.current ?? ''))?.workspaceId
        if (selectedWorkspace === target) {
          return
        }
      }
      store.leave()
    })
  }, [shell, store, switchingTo])
}

function WorkspaceHeader(props: {
  readonly shell: ShellServices
  readonly switchingTo: MutableRefObject<string | null>
  readonly drafts: DraftRegistry
}): ReactElement {
  const source = props.shell.workspaces?.list
  const snapshot = useSyncExternalStore(
    (listener) => source?.subscribe(listener) ?? (() => undefined),
    () => source?.getSnapshot() ?? EMPTY_WORKSPACE_SNAPSHOT,
    () => source?.getSnapshot() ?? EMPTY_WORKSPACE_SNAPSHOT,
  )
  const sessionSource = props.shell.sessions?.list
  const session = useSyncExternalStore(
    (listener) => sessionSource?.subscribe(listener) ?? (() => undefined),
    () => sessionSource?.getSnapshot() ?? EMPTY_SESSION_SNAPSHOT,
    () => sessionSource?.getSnapshot() ?? EMPTY_SESSION_SNAPSHOT,
  )
  const hasDraft = useSyncExternalStore(
    props.drafts.subscribe,
    props.drafts.held,
    props.drafts.held,
  )
  const owning = snapshot.items.find(
    (workspace) => session.current !== undefined && workspace.sessionIds.includes(session.current),
  )
  const current =
    session.current === undefined
      ? (snapshot.recentWorkspaceId ?? null)
      : (owning?.workspaceId ?? null)
  const empty = snapshot.items.length === 0
  return createElement(
    'header',
    { 'data-scrum-topbar': true },
    createElement(
      'label',
      { htmlFor: 'scrum-workspace' },
      current === null ? '当前未绑定工作区，请选择工作区' : 'Scrum 项目管理：',
    ),
    createElement(
      'select',
      {
        id: 'scrum-workspace',
        value: current ?? '',
        disabled: empty || hasDraft || props.shell.workspaces === undefined,
        title: hasDraft ? '请先保存或取消正在编辑的内容，再切换工作区' : undefined,
        'aria-label': 'Scrum 工作区',
        onChange: (event: { target: { value: string } }) => {
          const workspaceId = event.target.value
          if (workspaceId === '' || workspaceId === current) {
            return
          }
          props.switchingTo.current = workspaceId
          props.shell.workspaces?.startSession(workspaceId)
        },
      },
      current === null
        ? createElement(
            'option',
            { value: '', disabled: true },
            empty ? '没有可用的工作区' : '选择工作区',
          )
        : null,
      snapshot.items.map((workspace) =>
        createElement(
          'option',
          { key: workspace.workspaceId, value: workspace.workspaceId },
          workspace.title ??
            workspace.path?.split('/').filter(Boolean).at(-1) ??
            workspace.workspaceId,
        ),
      ),
    ),
  )
}

/**
 * Where the focus goes when the mode changes.
 *
 * Entering from the sidebar leaves the focus on the entry, behind a surface
 * that now covers the rest of the shell; leaving without putting it back would
 * strand it on an element that is no longer where the user is. Both moves are
 * driven from the mode rather than from a cleanup, because React runs cleanups
 * on the throwaway mount it performs in development and that one would take
 * the focus away the instant Scrum was entered.
 *
 * The first run never moves anything: a shell that mounts already in Scrum has
 * not navigated anywhere, and stealing the focus on load would be wrong.
 */
function useModeFocus(mode: ShellMode, element: { readonly current: HTMLElement | null }): void {
  const owner = useRef<Document | null>(null)
  const previous = useRef<ShellMode | null>(null)

  useEffect(() => {
    const host = element.current
    if (host !== null) {
      // Kept from while the overlay was mounted: on the way out it is gone,
      // and the entry to hand the focus back to lives in that same document.
      owner.current = host.ownerDocument
    }
    const was = previous.current
    previous.current = mode
    if (was === null || was === mode) {
      return
    }
    if (mode === 'scrum') {
      host?.querySelector<HTMLElement>('[data-scrum-workbench]')?.focus()
      return
    }
    owner.current?.querySelector<HTMLElement>(`[data-scrum-entry="${ENTRY_ID}"]`)?.focus()
  }, [mode, element])
}

/**
 * The overlay entry.
 *
 * It renders nothing at all in conversation mode. The overlay slot is
 * click-through until an entry opts into pointer events, so a workbench that
 * was not showing and still returned an empty container would remain a layer
 * over the conversation.
 */
function overlayComponent(
  store: ScrumModeStore,
  client: ScrumClient,
  shell: ShellServices,
  drafts: DraftRegistry,
): () => ReactElement | null {
  return function ScrumOverlay(): ReactElement | null {
    const mode = useMode(store)
    const leaving = useLeaving(store)
    const showing = mode === 'scrum'
    const sidebar = useSidebarInset(showing)
    const switchingTo = useRef<string | null>(null)
    // Escape answers whatever is on screen: the question when one is up, the
    // workbench otherwise. A key that did nothing while the question was
    // showing would read as the workbench having stopped listening.
    const workspace = useWorkspaceKey(shell)
    const escape = useCallback(() => {
      if (store.leaving()) {
        store.resume()
        return
      }
      store.leave()
    }, [])
    // Above the early return, and so still running in conversation mode: the
    // baseline it tracks has to be current when the user next enters Scrum.
    useSessionExit(shell, store, switchingTo)
    useEscape(showing, sidebar.element, escape)
    useModeFocus(mode, sidebar.element)
    if (!showing) {
      return null
    }
    return createElement(
      'div',
      {
        ref: sidebar.ref,
        'data-scrum-overlay': ENTRY_ID,
        style: {
          position: 'absolute',
          // Not `inset`, which would take the sidebar with it. The workbench
          // replaces the conversation and the details, and the column the user
          // opened it from stays where it was.
          top: 0,
          right: 0,
          bottom: 0,
          left: sidebar.inset,
          overflow: 'auto',
          pointerEvents: 'auto',
          background: SHELL_BACKGROUND,
        },
      },
      createElement(ConnectedWorkbench, {
        // Identity, not decoration: a new workspace is a new project, and the
        // surface reloads by being mounted again rather than by being told.
        key: workspace,
        client,
        drafts,
        header: createElement(WorkspaceHeader, { shell, switchingTo, drafts }),
        leaving,
        onExit: store.leave,
        onResume: store.resume,
        onDiscard: store.discard,
      }),
    )
  }
}

/** The client over the shell's channel, or nothing when it carries none. */
function shellClient(shell: ShellServices): ScrumClient | null {
  const connection = shell.connection
  if (connection === undefined) {
    return null
  }
  return createTransportClient(
    (channel, endpoint, payload) => connection.rpc.call(channel, endpoint, payload),
    () => readScope(shell),
  )
}

export function apply(ctx: ClientContext, config: ScrumClientConfig = {}): void {
  const shell = ctx as unknown as ShellServices
  const drafts = config.drafts ?? createDraftRegistry()
  const store = config.store ?? createScrumModeStore({ drafts })
  const client =
    config.client ??
    shellClient(shell) ??
    disconnectedClient(createTranslate()('error.notConnected'))

  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      { name: 'sidebar.footer.action', id: ENTRY_ID, order: -1 },
      entryComponent(store),
    ),
  )
  // Waited on separately: the two slots are declared by two host plugins, and
  // making one registration wait for the other would leave the entry missing
  // whenever the overlay's owner is late.
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: ENTRY_ID, order: 0 },
      overlayComponent(store, client, shell, drafts),
    ),
  )
}

export { SCRUM_NAMESPACE }
export type { RpcCall, RpcOutcome, ScopeReader } from './transport.js'
export { ScrumCallError, createTransportClient } from './transport.js'
