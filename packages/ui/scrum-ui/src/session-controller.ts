import type { ScrumClient } from './client.js'
import { toFailure, type ScrumFailure } from './failure.js'
import {
  describeSession,
  type AccessMode,
  type SessionSummary,
  type SessionView,
} from './session.js'

/**
 * What the access control is showing.
 *
 * `summary` is absent while the answer is unknown, which is not the same as
 * the session having no access: telling a user the agent is off when nobody
 * has asked yet would be a claim the screen cannot stand behind.
 */
export interface SessionAccessState {
  readonly phase: 'loading' | 'ready' | 'failed'
  readonly summary: SessionSummary | null
  readonly failure: ScrumFailure | null
  readonly busy: boolean
}

export interface SessionAccessController {
  readonly state: () => SessionAccessState
  readonly subscribe: (listener: () => void) => () => void
  readonly load: () => Promise<void>
  readonly setMode: (mode: AccessMode) => Promise<void>
  readonly dismiss: () => void
}

/**
 * One controller per workbench, and one workbench per Harness session.
 *
 * Nothing is stored in this object that outlives a read. The mode lives with
 * the host, keyed by instance and session, so two sessions open at once each
 * get their own answer and neither is affected by what the other picked — and
 * a refresh of the browser half shows what the store holds rather than what
 * this object last remembered.
 */
export function createSessionAccessController(
  client: ScrumClient,
  /** Whether the workspace still resolves to a project. */
  isBound: () => boolean,
): SessionAccessController {
  let state: SessionAccessState = {
    phase: 'loading',
    summary: null,
    failure: null,
    busy: false,
  }
  const listeners = new Set<() => void>()

  function set(next: SessionAccessState): void {
    state = next
    for (const listener of [...listeners]) {
      listener()
    }
  }

  function describe(view: SessionView): SessionSummary {
    return describeSession(view, isBound())
  }

  async function load(): Promise<void> {
    try {
      set({ phase: 'ready', summary: describe(await client.session()), failure: null, busy: false })
    } catch (error: unknown) {
      set({ phase: 'failed', summary: null, failure: toFailure(error), busy: false })
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
     * Sets the mode and shows what came back, not what was asked for.
     *
     * The host answers with the session resolved afresh, so a write that was
     * accepted and then narrowed — by an archived project, by roles that no
     * longer allow it — arrives already narrowed, and the screen explains it
     * instead of claiming the request went through unchanged.
     */
    setMode: async (mode: AccessMode) => {
      set({ ...state, busy: true, failure: null })
      try {
        set({
          phase: 'ready',
          summary: describe(await client.setSessionAccess(mode)),
          failure: null,
          busy: false,
        })
      } catch (error: unknown) {
        set({ ...state, busy: false, failure: toFailure(error) })
      }
    },
    dismiss: () => {
      set({ ...state, failure: null })
    },
  }
}
