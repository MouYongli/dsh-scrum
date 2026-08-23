import type { ConfigureProjectInput, ProjectSettingsView, ScrumClient } from './client.js'
import { toFailure, type ScrumFailure } from './failure.js'

export interface SettingsState {
  readonly phase: 'loading' | 'ready' | 'failed'
  readonly settings: ProjectSettingsView | null
  readonly failure: ScrumFailure | null
  readonly busy: boolean
  /** True once a save has landed, until the next edit. */
  readonly saved: boolean
}

export interface SettingsController {
  readonly state: () => SettingsState
  readonly subscribe: (listener: () => void) => () => void
  readonly load: () => Promise<void>
  readonly save: (changes: ConfigureProjectInput['changes']) => Promise<void>
  readonly dismiss: () => void
}

const EMPTY: SettingsState = {
  phase: 'loading',
  settings: null,
  failure: null,
  busy: false,
  saved: false,
}

/**
 * The project's configuration, read and written.
 *
 * The revision travels with the save and comes from the read, so two people
 * tuning the same project cannot silently overwrite each other. A refused save
 * leaves the form exactly as the user left it and says why — blanking what
 * they typed because somebody else changed a different field would be the
 * worst possible answer to a conflict.
 */
export function createSettingsController(client: ScrumClient): SettingsController {
  let state: SettingsState = EMPTY
  const listeners = new Set<() => void>()

  function set(next: SettingsState): void {
    state = next
    for (const listener of [...listeners]) {
      listener()
    }
  }

  async function load(): Promise<void> {
    try {
      set({ ...state, phase: 'ready', settings: await client.settings(), failure: null })
    } catch (error: unknown) {
      set({ ...state, phase: 'failed', settings: null, failure: toFailure(error) })
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
    save: async (changes) => {
      const current = state.settings
      if (current === null) {
        return
      }
      set({ ...state, busy: true, failure: null, saved: false })
      try {
        await client.configureProject({ expectedRevision: current.revision, changes })
        // Read back rather than patched: the store normalises what it was
        // given — trimming entries, refusing a blank one — and a form left
        // showing what was typed would disagree with what was stored.
        await load()
        set({ ...state, busy: false, saved: true })
      } catch (error: unknown) {
        set({ ...state, busy: false, failure: toFailure(error) })
      }
    },
    dismiss: () => {
      set({ ...state, failure: null, saved: false })
    },
  }
}
