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
  createScrumModeStore,
  disconnectedClient,
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
}

/** Reads the mode without owning it, so both registrations see one answer. */
function useMode(store: ScrumModeStore): ShellMode {
  return useSyncExternalStore(store.subscribe, store.mode, store.mode)
}

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
        'aria-label': t('entry.open'),
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
          background: 'transparent',
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

  return { ref, inset }
}

/**
 * The overlay entry.
 *
 * It renders nothing at all in conversation mode. The overlay slot is
 * click-through until an entry opts into pointer events, so a workbench that
 * was not showing and still returned an empty container would remain a layer
 * over the conversation.
 */
function overlayComponent(store: ScrumModeStore, client: ScrumClient): () => ReactElement | null {
  return function ScrumOverlay(): ReactElement | null {
    const showing = useMode(store) === 'scrum'
    const sidebar = useSidebarInset(showing)
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
      createElement(ConnectedWorkbench, { client, onClose: () => store.leave() }),
    )
  }
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
        }[]
        readonly recentWorkspaceId?: string | undefined
      }
    }
  }
  readonly sessions?: {
    readonly list: { getSnapshot(): { readonly current?: string | undefined } }
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
    workspaceId: owning?.workspaceId ?? workspaces?.recentWorkspaceId ?? null,
    sessionId,
  }
}

/** The client over the shell's channel, or nothing when it carries none. */
function shellClient(ctx: ClientContext): ScrumClient | null {
  const shell = ctx as unknown as ShellServices
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
  const store = config.store ?? createScrumModeStore()
  const client =
    config.client ?? shellClient(ctx) ?? disconnectedClient(createTranslate()('error.notConnected'))

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
      overlayComponent(store, client),
    ),
  )
}

export { SCRUM_NAMESPACE }
export type { RpcCall, RpcOutcome, ScopeReader } from './transport.js'
export { ScrumCallError, createTransportClient } from './transport.js'
