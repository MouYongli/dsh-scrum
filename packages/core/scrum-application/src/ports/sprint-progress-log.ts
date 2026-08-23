import type { SprintId, Timestamp, WorkItemId } from '@dsh-scrum/scrum-domain'

/**
 * What a sprint committed to at the moment it started.
 *
 * Written once, when the sprint opens, and never touched again. Two questions
 * need it and neither can be answered without it: what came into the sprint
 * after it began, and where the burndown starts.
 *
 * Neither is reconstructible later. From the current data, an item in a sprint
 * looks the same whether it was there at the start or arrived on the third
 * day. Activity does not close the gap either — it records the action, the
 * target and the revisions either side, not the values, so it can say when an
 * item was planned in but not what it was estimated at.
 *
 * This is not the sprint's membership list and does not live on the sprint.
 * Membership stays with the items, and the sprint file carries no list of
 * them. A baseline describes one past moment rather than the present, so the
 * two cannot disagree — that it does not move as items come and go is the
 * whole point of it.
 */
export interface SprintBaseline {
  readonly kind: 'baseline'
  readonly sprintId: SprintId
  readonly recordedAt: Timestamp
  /** Everything in the sprint when it opened. */
  readonly itemIds: readonly WorkItemId[]
  /** The points committed, with unestimated items counting zero. */
  readonly totalPoints: number
  /** How many of the committed items nobody had sized. */
  readonly unestimatedCount: number
}

/**
 * One recorded moment in a sprint's life.
 *
 * Tagged, because the daily remaining records described in
 * `docs/development/architecture.md` 7.6 land in the same file when something
 * schedules them. A shape wide enough for both, with half its fields null on
 * every row, would be a worse answer than a union that grows.
 */
export type SprintProgressEntry = SprintBaseline

/**
 * Where a commitment goes.
 *
 * Append-only by contract, like activity: there is no method to amend one,
 * because a baseline that could be rewritten answers a different question than
 * the one it exists for.
 */
export interface SprintProgressLog {
  append(entry: SprintProgressEntry): Promise<void>
  /** Everything recorded for one sprint, oldest first. */
  read(sprintId: SprintId): Promise<readonly SprintProgressEntry[]>
}
