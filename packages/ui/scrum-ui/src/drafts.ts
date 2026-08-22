/**
 * Who is holding input the user has not saved.
 *
 * Leaving Scrum is cheap for someone who was reading and expensive for someone
 * who was halfway through a form, and the surface cannot tell the two apart by
 * looking at itself: the forms are scattered across the backlog, the sprint
 * board and the item drawer, and several of them can be on screen at once. So
 * each one reports for itself, and this collects the answers.
 *
 * A registry rather than a boolean, because a report has to be able to go away
 * with the component that made it, and a boolean two forms had both set could
 * only be cleared by whichever released last.
 */
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  type ReactElement,
  type ReactNode,
} from 'react'

export interface DraftRegistry {
  /** Reports one draft. The returned function releases it. */
  readonly hold: () => () => void
  readonly held: () => boolean
  readonly subscribe: (listener: () => void) => () => void
}

export function createDraftRegistry(): DraftRegistry {
  let holds = 0
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const listener of [...listeners]) {
      listener()
    }
  }

  return {
    hold: () => {
      holds += 1
      // Only the edge is news: going from one form to two changes nothing
      // anybody asks about, and telling them would re-render for nothing.
      if (holds === 1) {
        notify()
      }
      let released = false
      return () => {
        // A release called twice would drop somebody else's hold, and the
        // registry would report clean with a form still half filled in.
        if (released) {
          return
        }
        released = true
        holds -= 1
        if (holds === 0) {
          notify()
        }
      }
    },
    held: () => holds > 0,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * A registry that records nothing.
 *
 * The context default, so a form rendered on its own — which is how every one
 * of them is tested — needs no provider and behaves as it always did.
 */
export const NO_DRAFTS: DraftRegistry = {
  hold: () => () => undefined,
  held: () => false,
  subscribe: () => () => undefined,
}

const DraftsContext = createContext<DraftRegistry>(NO_DRAFTS)

/**
 * Carries the registry down to the forms.
 *
 * The registry itself is created outside React and shared with the sidebar
 * entry, which is a separate registration in a separate tree: a context alone
 * could not answer the entry, and prop-drilling could not reach five levels of
 * pure components without changing all of them.
 */
export function DraftsProvider(props: {
  readonly registry: DraftRegistry
  readonly children?: ReactNode | undefined
}): ReactElement {
  return createElement(DraftsContext.Provider, { value: props.registry }, props.children)
}

/**
 * Reports whether this component is holding input the user has not saved.
 *
 * `dirty` means "differs from what this form was initialized with", never
 * "has something in it". A form opened over an existing entity starts full,
 * and a component that called itself dirty for that would make the question
 * unanswerable: leaving would ask, keeping would change nothing, and asking
 * again would give the same answer forever.
 *
 * @param dirty - whether the user has changed anything here yet.
 */
export function useDraftGuard(dirty: boolean): void {
  const registry = useContext(DraftsContext)
  useEffect(() => (dirty ? registry.hold() : undefined), [dirty, registry])
}

/**
 * Whether a form's values still match the ones it opened with.
 *
 * The comparison is by value rather than by identity, so a parent that rebuilt
 * an equal object on its way past does not turn an untouched form into unsaved
 * work. Shallow, because every one of these forms holds a flat record of
 * strings the user typed.
 */
export function sameDraft<T extends object>(fields: T, initial: T): boolean {
  const keys = Object.keys(fields) as (keyof T)[]
  return keys.every((key) => fields[key] === initial[key])
}
