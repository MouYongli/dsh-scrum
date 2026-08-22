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
import { createElement, useSyncExternalStore, type ReactElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Pulls in the slot map augmentations that declare the two slots used here.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  ConnectedWorkbench,
  SCRUM_NAMESPACE,
  createTranslate,
  createWorkbenchStore,
  disconnectedClient,
  type ScrumClient,
  type WorkbenchStore,
} from '@dsh-scrum/scrum-ui'

export const name = 'scrum-harness-client'

/**
 * The slot registry is the only service this entry needs. Declaring it keeps
 * the plugin pending rather than registering into a surface that is not there.
 */
export const inject = ['slots']

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
  readonly store?: WorkbenchStore | undefined
}

/** Reads the open flag without owning it, so both registrations see one answer. */
function useIsOpen(store: WorkbenchStore): boolean {
  return useSyncExternalStore(store.subscribe, store.isOpen, store.isOpen)
}

/**
 * Sidebar footer entry. The slot owner supplies only the column state: `wide`
 * is the expanded sidebar, otherwise the 56px rail, where the label has no
 * room and the entry has to fall back to its icon.
 */
function entryComponent(store: WorkbenchStore): (props: { wide: boolean }) => ReactElement {
  const t = createTranslate()
  return function ScrumEntry(props: { wide: boolean }): ReactElement {
    const open = useIsOpen(store)
    return createElement(
      'button',
      {
        type: 'button',
        'data-scrum-entry': ENTRY_ID,
        'aria-pressed': open,
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
 * The overlay entry.
 *
 * It renders nothing at all while closed. The overlay slot is click-through
 * until an entry opts into pointer events, so a closed workbench that returned
 * an empty container would still be a layer over the conversation.
 */
function overlayComponent(store: WorkbenchStore, client: ScrumClient): () => ReactElement | null {
  return function ScrumOverlay(): ReactElement | null {
    if (!useIsOpen(store)) {
      return null
    }
    return createElement(
      'div',
      {
        'data-scrum-overlay': ENTRY_ID,
        style: {
          position: 'absolute',
          inset: 0,
          overflow: 'auto',
          pointerEvents: 'auto',
          background: SHELL_BACKGROUND,
        },
      },
      createElement(ConnectedWorkbench, { client, onClose: () => store.close() }),
    )
  }
}

export function apply(ctx: ClientContext, config: ScrumClientConfig = {}): void {
  const store = config.store ?? createWorkbenchStore()
  const client = config.client ?? disconnectedClient(createTranslate()('error.notConnected'))

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
