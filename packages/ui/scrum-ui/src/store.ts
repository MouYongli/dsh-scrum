/**
 * Whether the workbench is open.
 *
 * A module-level store rather than component state, because the sidebar entry
 * and the overlay are two registrations in two slots and neither owns the
 * other. It also outlives a workspace or session change: the overlay is a
 * root-level surface, and closing it because the user picked another session
 * would throw away what they were reading.
 */
/**
 * Declared as function-valued properties rather than methods: they are handed
 * to `useSyncExternalStore` on their own, and a method signature would let a
 * later implementation depend on `this` in a place that has already lost it.
 */
export interface WorkbenchStore {
  readonly isOpen: () => boolean
  readonly open: () => void
  readonly close: () => void
  readonly toggle: () => void
  readonly subscribe: (listener: () => void) => () => void
}

export function createWorkbenchStore(initiallyOpen = false): WorkbenchStore {
  let open = initiallyOpen
  const listeners = new Set<() => void>()

  function set(next: boolean): void {
    if (next === open) {
      return
    }
    open = next
    for (const listener of [...listeners]) {
      listener()
    }
  }

  return {
    isOpen: () => open,
    open: () => {
      set(true)
    },
    close: () => {
      set(false)
    },
    toggle: () => {
      set(!open)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
