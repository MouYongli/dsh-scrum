import {
  SPRINT_STATUS,
  WORK_ITEM_STATUS,
  isWorkItemBlocked,
  isWorkItemFinished,
  type Sprint,
  type Timestamp,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import type {
  ActivityEventView,
  ProjectSettingsView,
  SprintReportView,
  SprintScopeChangeView,
} from './client.js'

/**
 * The four things a dashboard says are worth looking at.
 *
 * Each names an action: unblock it, ask why it has not moved, size it at
 * planning, explain it at review. A number nobody can act on is a number that
 * teaches people to stop reading the page, so nothing else is listed here.
 */
export const DASHBOARD_SIGNAL = {
  blocked: 'blocked',
  stalled: 'stalled',
  unestimated: 'unestimated',
  added: 'added',
} as const

export type DashboardSignal = (typeof DASHBOARD_SIGNAL)[keyof typeof DASHBOARD_SIGNAL]

/** The signals in the order the page shows them, most urgent first. */
export const DASHBOARD_SIGNALS: readonly DashboardSignal[] = [
  DASHBOARD_SIGNAL.blocked,
  DASHBOARD_SIGNAL.stalled,
  DASHBOARD_SIGNAL.unestimated,
  DASHBOARD_SIGNAL.added,
]

export interface SignalGroup {
  readonly signal: DashboardSignal
  readonly items: readonly WorkItem[]
}

/**
 * The burndown, with only the two points that exist.
 *
 * A sprint records what it committed to when it opened and nothing since, so
 * there is no curve to draw — the days between are not stored and cannot be
 * reconstructed. Drawn honestly: where the sprint started, where it is now,
 * and the straight line between them that says where it would be if the work
 * were spread evenly.
 */
export interface BurndownView {
  readonly committed: number
  /** Points not yet delivered, counting the unestimated as zero. */
  readonly remaining: number
  readonly startDate: Timestamp
  readonly endDate: Timestamp
  /** How much of the sprint has passed, 0 to 1, clamped at both ends. */
  readonly elapsed: number
  /** Where the remaining points would be if the work were spread evenly. */
  readonly ideal: number
}

export interface DashboardView {
  /** The sprint in progress, or null when none is running. */
  readonly sprint: Sprint | null
  readonly report: SprintReportView | null
  /** Only the signals with something in them; an empty one is not drawn. */
  readonly signals: readonly SignalGroup[]
  readonly burndown: BurndownView | null
  readonly scopeChange: SprintScopeChangeView | null
  readonly activity: readonly ActivityEventView[]
}

export interface DashboardInput {
  readonly items: readonly WorkItem[]
  readonly sprints: readonly Sprint[]
  readonly report: SprintReportView | null
  readonly activity: readonly ActivityEventView[]
  readonly settings: ProjectSettingsView | null
  readonly now: Timestamp
}

/** The status changes the activity log records, as far as staleness cares. */
const STATUS_ACTIONS = ['workItem.status', 'workItem.create']

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

export function currentSprint(sprints: readonly Sprint[]): Sprint | null {
  return sprints.find((sprint) => sprint.status === SPRINT_STATUS.active) ?? null
}

/**
 * When each item last changed status, as far as the log can say.
 *
 * The log is read through a bounded window, so an item whose last move is
 * older than the window has no event here. It falls back to `updatedAt`, which
 * moves on any edit and therefore under-reports staleness: an item retitled
 * yesterday reads as fresh. That is the safer mistake — a false alarm nags
 * every morning, a missed one is only silence.
 */
function lastMoved(activity: readonly ActivityEventView[]): Map<string, Timestamp> {
  const moved = new Map<string, Timestamp>()
  for (const event of activity) {
    if (event.targetType !== 'workItem' || !STATUS_ACTIONS.includes(event.action)) {
      continue
    }
    const seen = moved.get(event.targetId)
    if (seen === undefined || event.at > seen) {
      moved.set(event.targetId, event.at)
    }
  }
  return moved
}

function daysBetween(from: Timestamp, to: Timestamp): number {
  return (Date.parse(to) - Date.parse(from)) / DAY_IN_MILLISECONDS
}

/**
 * Work that is in the running sprint and has not finished.
 *
 * Every signal but the scope change is about this set: an item in the backlog
 * cannot be stalled, and one nobody has sized is a planning question rather
 * than a today question until a sprint takes it on.
 */
function inFlight(items: readonly WorkItem[], sprint: Sprint | null): readonly WorkItem[] {
  if (sprint === null) {
    return []
  }
  return items.filter((item) => item.sprintId === sprint.id && !isWorkItemFinished(item))
}

function stalled(
  items: readonly WorkItem[],
  activity: readonly ActivityEventView[],
  after: number,
  now: Timestamp,
): readonly WorkItem[] {
  const moved = lastMoved(activity)
  return items.filter((item) => {
    // Nothing in the first column is stalled: it has not been picked up, which
    // is what a backlog column is for.
    if (item.status === WORK_ITEM_STATUS.backlog) {
      return false
    }
    return daysBetween(moved.get(item.id) ?? item.updatedAt, now) >= after
  })
}

function added(
  items: readonly WorkItem[],
  scope: SprintScopeChangeView | null,
): readonly WorkItem[] {
  if (scope === null) {
    return []
  }
  const arrived = new Set<WorkItemId>(scope.added)
  return items.filter((item) => arrived.has(item.id))
}

/**
 * The burndown for a running sprint, or null when there is nothing to draw.
 *
 * Null for a sprint that never opened: with no baseline the line would have to
 * start from zero, and a chart claiming a team committed to nothing is worse
 * than no chart.
 */
export function burndown(
  sprint: Sprint | null,
  report: SprintReportView | null,
  now: Timestamp,
): BurndownView | null {
  if (sprint === null || report === null || report.baseline === null) {
    return null
  }
  const span = daysBetween(sprint.startDate, sprint.endDate)
  const gone = daysBetween(sprint.startDate, now)
  const elapsed = span <= 0 ? 1 : Math.min(1, Math.max(0, gone / span))
  const committed = report.baseline.totalPoints
  return {
    committed,
    // Against the sprint's own total rather than the baseline's: what is left
    // is what is in the sprint now and not delivered, including work that
    // arrived after it opened.
    remaining: report.progress.total.estimate - report.progress.delivered.estimate,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    elapsed,
    ideal: committed * (1 - elapsed),
  }
}

export function dashboardView(input: DashboardInput): DashboardView {
  const sprint = currentSprint(input.sprints)
  const open = inFlight(input.items, sprint)
  const scopeChange = input.report?.scopeChange ?? null
  const groups: readonly SignalGroup[] = [
    { signal: DASHBOARD_SIGNAL.blocked, items: open.filter(isWorkItemBlocked) },
    {
      signal: DASHBOARD_SIGNAL.stalled,
      items: stalled(open, input.activity, input.settings?.stalledAfterDays ?? 3, input.now),
    },
    {
      signal: DASHBOARD_SIGNAL.unestimated,
      items: open.filter((item) => item.estimate === null),
    },
    { signal: DASHBOARD_SIGNAL.added, items: added(input.items, scopeChange) },
  ]
  return {
    sprint,
    report: input.report,
    signals: groups.filter((group) => group.items.length > 0),
    burndown: burndown(sprint, input.report, input.now),
    scopeChange,
    activity: input.activity,
  }
}
