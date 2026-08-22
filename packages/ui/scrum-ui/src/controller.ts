import type { CreateProjectInput, EntryView, ScrumClient } from './client.js'
import { toFailure, type ScrumFailure } from './failure.js'

/**
 * What the workbench is showing.
 *
 * `creating` rides on `ready` rather than being a state of its own: the page
 * stays on screen while a project is being created, and a separate state would
 * mean rebuilding it — and losing what the user typed — the moment they
 * submitted.
 *
 * A refused creation rides on `ready` for the same reason, and it is the case
 * that matters most: the user has three fields filled in, one of them is what
 * the host objected to, and replacing the page with an error screen throws all
 * three away at the exact moment they need to be edited. `failed` is left for
 * the load, where there is no page to keep.
 */
export type WorkbenchState =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready'
      readonly entry: EntryView
      readonly creating: boolean
      readonly failure: ScrumFailure | null
    }
  | { readonly kind: 'failed'; readonly message: string }

/**
 * The workbench's asynchronous half, kept out of the component.
 *
 * A component that fetched inside an effect could only be checked by rendering
 * it and waiting, which in practice means the states nobody waited for go
 * untested. This is a plain object with a subscription, so every transition is
 * a value a test can read.
 */
export interface WorkbenchController {
  readonly state: () => WorkbenchState
  readonly subscribe: (listener: () => void) => () => void
  readonly load: () => Promise<void>
  readonly create: (input: CreateProjectInput) => Promise<void>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createWorkbenchController(client: ScrumClient): WorkbenchController {
  let state: WorkbenchState = { kind: 'loading' }
  const listeners = new Set<() => void>()

  function set(next: WorkbenchState): void {
    state = next
    for (const listener of [...listeners]) {
      listener()
    }
  }

  async function load(): Promise<void> {
    try {
      set({ kind: 'ready', entry: await client.entry(), creating: false, failure: null })
    } catch (error: unknown) {
      set({ kind: 'failed', message: messageOf(error) })
    }
  }

  return {
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load,
    /**
     * Creating reloads rather than patching the state from the response. The
     * project is one of several things the entry state depends on, and a page
     * assembled from a create response would be a second answer that can
     * disagree with the one the host would give.
     */
    create: async (input: CreateProjectInput) => {
      if (state.kind === 'ready') {
        set({ ...state, creating: true, failure: null })
      }
      try {
        await client.createProject(input)
        await load()
      } catch (error: unknown) {
        // The page is kept when there is one to keep. A creation refused for a
        // key somebody already took, or for a permission the session does not
        // have, is a refusal the user answers by editing the form they are
        // looking at.
        set(
          state.kind === 'ready'
            ? { ...state, creating: false, failure: toFailure(error) }
            : { kind: 'failed', message: messageOf(error) },
        )
      }
    },
  }
}
