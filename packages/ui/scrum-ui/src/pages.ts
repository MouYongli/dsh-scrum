import type { EntryView } from './client.js'
import type { MessageKey } from './messages.js'

/**
 * What one first-run state puts on the page.
 *
 * A view model rather than a component, so the decision about which state
 * shows what is a value a test can read. A component that decided it inline
 * would only be checkable by rendering it and reading the output back, which
 * is how a state nobody exercised ends up rendering nothing at all.
 */
export interface PageView {
  readonly state: EntryView['state']
  readonly title: MessageKey
  readonly body: MessageKey
  /** The heading above the page, when a workspace is open. */
  readonly workspaceName: string | null
  /** Shown when the workspace has moved since it was attached. */
  readonly notice: MessageKey | null
  readonly action: { readonly kind: 'create'; readonly label: MessageKey } | null
  readonly project: { readonly key: string; readonly name: string } | null
}

const BASE = {
  workspaceName: null,
  notice: null,
  action: null,
  project: null,
} as const

/**
 * Maps an entry state onto a page.
 *
 * Exhaustive by construction: the union has no default branch, so a state
 * added to the host without a page here does not compile.
 */
export function pageFor(entry: EntryView): PageView {
  switch (entry.state) {
    case 'no-workspace':
      return {
        ...BASE,
        state: entry.state,
        title: 'state.noWorkspace.title',
        body: 'state.noWorkspace.body',
      }
    case 'unbound':
      return {
        ...BASE,
        state: entry.state,
        title: 'state.unbound.title',
        body: 'state.unbound.body',
        workspaceName: entry.workspace.name,
        action: { kind: 'create', label: 'state.unbound.create' },
      }
    case 'stale':
      return {
        ...BASE,
        state: entry.state,
        title: 'state.stale.title',
        body: 'state.stale.body',
        workspaceName: entry.workspace.name,
      }
    case 'archived':
      return {
        ...BASE,
        state: entry.state,
        title: 'state.archived.title',
        body: 'state.archived.body',
        workspaceName: entry.workspace.name,
        notice: entry.moved ? 'state.moved.notice' : null,
        project: { key: entry.project.key, name: entry.project.name },
      }
    case 'bound':
      return {
        ...BASE,
        state: entry.state,
        title: 'state.bound.title',
        body: 'state.bound.body',
        workspaceName: entry.workspace.name,
        notice: entry.moved ? 'state.moved.notice' : null,
        project: { key: entry.project.key, name: entry.project.name },
      }
  }
}
