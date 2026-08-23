import { timestampFromDate, type Timestamp } from '@dsh-scrum/scrum-domain'
import type { ScrumClient } from './client.js'
import { currentSprint, dashboardView, type DashboardView } from './dashboard.js'
import { toFailure, type ScrumFailure } from './failure.js'

/**
 * How much history the panel asks for.
 *
 * Wide enough to hold the last status change of everything in a sprint, which
 * is what staleness is decided from, and short enough that the answer is one
 * month file on a normal project.
 */
export const ACTIVITY_WINDOW = 100

export interface DashboardState {
  readonly phase: 'loading' | 'ready' | 'failed'
  readonly view: DashboardView | null
  readonly failure: ScrumFailure | null
  /** What the activity log holds but could not read back. */
  readonly problems: readonly string[]
}

export interface DashboardController {
  readonly state: () => DashboardState
  readonly subscribe: (listener: () => void) => () => void
  readonly load: () => Promise<void>
}

const EMPTY: DashboardState = { phase: 'loading', view: null, failure: null, problems: [] }

/**
 * Reads everything the dashboard needs and folds it into one view.
 *
 * Five reads rather than one endpoint that returns a dashboard: each answers a
 * question something else already asks, and a sixth shape assembled on the
 * host would be a second definition of what a signal is, kept in step with
 * this one by hand.
 *
 * The sprint report is only asked for once a sprint is running. A project that
 * has never started one has no report to fetch, and asking anyway would turn
 * an ordinary state into an error in the panel.
 */
export function createDashboardController(
  client: ScrumClient,
  now: () => Timestamp = () => timestampFromDate(new Date()),
): DashboardController {
  let state: DashboardState = EMPTY
  const listeners = new Set<() => void>()

  function set(next: DashboardState): void {
    state = next
    for (const listener of [...listeners]) {
      listener()
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
    load: async () => {
      try {
        const [items, sprints, settings, history] = await Promise.all([
          client.backlog({}),
          client.sprints(),
          client.settings(),
          client.activity({ limit: ACTIVITY_WINDOW }),
        ])
        const running = currentSprint(sprints)
        const report = running === null ? null : await client.sprintReport(running.id)
        set({
          phase: 'ready',
          view: dashboardView({
            items,
            sprints,
            report,
            activity: history.events,
            settings,
            now: now(),
          }),
          failure: null,
          problems: history.problems,
        })
      } catch (error: unknown) {
        set({ phase: 'failed', view: null, failure: toFailure(error), problems: [] })
      }
    },
  }
}
