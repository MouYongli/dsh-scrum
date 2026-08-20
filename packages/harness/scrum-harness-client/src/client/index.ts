/**
 * Browser half of the Scrum plugin. It is not imported by the host: the module
 * loader serves this bundle to the web shell, which executes it only to
 * register a factory and runs the body when the module is first required.
 *
 * At this stage it registers one entry point, enough to prove the seam end to
 * end. The Scrum workbench itself will register into `shell.overlay`.
 *
 * @module @dsh-scrum/scrum-harness-client/client
 */
import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Pulls in the slot map augmentation that declares `sidebar.footer.action`.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

export const name = 'scrum-harness-client'

/**
 * The slot registry is the only service this entry needs. Declaring it keeps
 * the plugin pending rather than registering into a surface that is not there.
 */
export const inject = ['slots']

/** Identifier the sidebar addresses this registration by. */
const ENTRY_ID = 'scrum'

/**
 * Sidebar footer entry. The slot owner supplies only the column state: `wide`
 * is the expanded sidebar, otherwise the 56px rail, where the label has no
 * room and the entry has to fall back to its icon.
 */
function ScrumEntry(props: { wide: boolean }): ReturnType<typeof createElement> {
  return createElement(
    'button',
    {
      type: 'button',
      'data-scrum-entry': ENTRY_ID,
      title: 'Scrum',
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
    props.wide ? createElement('span', null, 'Scrum') : null,
  )
}

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({ name: 'sidebar.footer.action', id: ENTRY_ID, order: -1 }, ScrumEntry),
  )
}
