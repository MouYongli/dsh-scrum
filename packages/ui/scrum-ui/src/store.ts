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
  readonly enter: () => void
  /** Back to the conversation. Named for where it goes, not for a widget. */
  readonly leave: () => void
  readonly toggle: () => void
  readonly subscribe: (listener: () => void) => () => void
}

export function createScrumModeStore(initial: ShellMode = 'conversation'): ScrumModeStore {
  let mode = initial
  const listeners = new Set<() => void>()

  function set(next: ShellMode): void {
    if (next === mode) {
      return
    }
    mode = next
    for (const listener of [...listeners]) {
      listener()
    }
  }

  return {
    mode: () => mode,
    enter: () => {
      set('scrum')
    },
    leave: () => {
      set('conversation')
    },
    toggle: () => {
      set(mode === 'scrum' ? 'conversation' : 'scrum')
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
