/**
 * Which of the shell's two working modes is showing.
 *
 * Scrum sits beside the conversation rather than on top of it: entering it is
 * a navigation, not a popup, and picking a session is a navigation back. A
 * module-level store rather than component state, because the sidebar entry
 * and the overlay are two registrations in two slots and neither owns the
 * other — they have to read one answer or they will disagree about which mode
 * the shell is in.
 */
import { NO_DRAFTS, type DraftRegistry } from './drafts.js'

/**
 * Declared as function-valued properties rather than methods: they are handed
 * to `useSyncExternalStore` on their own, and a method signature would let a
 * later implementation depend on `this` in a place that has already lost it.
 *
 * Every getter answers a primitive. One that assembled an object would be
 * compared by identity on every pass and re-render forever — a fault that a
 * static render never reaches, because it never subscribes.
 */
export type ShellMode = 'conversation' | 'scrum'

export interface ScrumModeStore {
  readonly mode: () => ShellMode
  /** Whether a leave is waiting on an answer about unsaved input. */
  readonly leaving: () => boolean
  readonly enter: () => void
  /** Back to the conversation. Named for where it goes, not for a widget. */
  readonly leave: () => void
  /** Answers the question with "drop what I typed". */
  readonly discard: () => void
  /** Answers it with "keep editing". The mode does not change either way. */
  readonly resume: () => void
  readonly toggle: () => void
  readonly subscribe: (listener: () => void) => () => void
}

export function createScrumModeStore(
  options: {
    readonly initial?: ShellMode | undefined
    readonly drafts?: DraftRegistry | undefined
  } = {},
): ScrumModeStore {
  const drafts = options.drafts ?? NO_DRAFTS
  let mode = options.initial ?? 'conversation'
  let leaving = false
  const listeners = new Set<() => void>()

  function set(nextMode: ShellMode, nextLeaving: boolean): void {
    if (nextMode === mode && nextLeaving === leaving) {
      return
    }
    mode = nextMode
    leaving = nextLeaving
    for (const listener of [...listeners]) {
      listener()
    }
  }

  function askOrLeave(): void {
    if (mode !== 'scrum' || leaving) {
      return
    }
    if (drafts.held()) {
      // Asking must not change the mode. The forms holding the drafts live in
      // the overlay's subtree, and the overlay renders nothing in conversation
      // mode: switching first would take away the very thing being asked about
      // and leave the question with nowhere to be drawn.
      set('scrum', true)
      return
    }
    set('conversation', false)
  }

  drafts.subscribe(() => {
    // The question outlived what it was about — the form behind it was saved
    // or cancelled — so finish the leave instead of asking about nothing.
    if (leaving && !drafts.held()) {
      set('conversation', false)
    }
  })

  return {
    mode: () => mode,
    leaving: () => leaving,
    enter: () => {
      set('scrum', false)
    },
    leave: askOrLeave,
    discard: () => {
      set('conversation', false)
    },
    resume: () => {
      set(mode, false)
    },
    toggle: () => {
      if (mode === 'conversation') {
        set('scrum', false)
        return
      }
      if (leaving) {
        set(mode, false)
        return
      }
      askOrLeave()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
