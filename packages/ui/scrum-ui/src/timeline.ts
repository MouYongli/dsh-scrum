import {
  WORK_ITEM_LEVEL,
  WORK_ITEM_TYPE,
  isWorkItemFinished,
  type Sprint,
  type SprintId,
  type Timestamp,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'

/**
 * A stretch of time a bar covers.
 *
 * Half-open in spirit and inclusive in practice: a sprint's own start and end
 * are the dates the team agreed to, and a bar that stopped a day short of the
 * end date would be describing a different sprint than the one on the board.
 */
export interface Span {
  readonly start: Timestamp
  readonly end: Timestamp
}

/** One column of the grid, which is one sprint. */
export interface TimelineColumn {
  readonly sprint: Sprint
  readonly span: Span
}

export interface TimelineBar {
  readonly span: Span
  /** Where the bar starts and ends across the whole grid, each 0 to 1. */
  readonly from: number
  readonly to: number
}

export interface TimelineRow {
  readonly item: WorkItem
  /** Null for work in no sprint, which has no time to be drawn at. */
  readonly bar: TimelineBar | null
  readonly children: readonly TimelineRow[]
  /**
   * Points delivered over points carried, for a row that contains others.
   *
   * Null on a row that contains nothing: a leaf's progress is its status, and
   * a percentage on it would be 0 or 100 dressed up as a measurement.
   */
  readonly progress: { readonly delivered: number; readonly total: number } | null
}

export interface TimelineView {
  readonly columns: readonly TimelineColumn[]
  /** The whole grid, from the first sprint's start to the last one's end. */
  readonly span: Span | null
  readonly rows: readonly TimelineRow[]
  /** Work in no sprint. Grouped rather than dropped, and drawn without bars. */
  readonly unscheduled: readonly TimelineRow[]
}

const EPIC_LEVEL = WORK_ITEM_LEVEL[WORK_ITEM_TYPE.epic]

function at(value: Timestamp): number {
  return Date.parse(value)
}

/**
 * The sprints in date order, which is the order a grid reads in.
 *
 * Sorted here rather than trusted: sprints are created when somebody gets
 * round to it, and a grid drawn in creation order would run backwards the
 * first time a team planned two sprints out of sequence.
 */
export function timelineColumns(sprints: readonly Sprint[]): readonly TimelineColumn[] {
  return [...sprints]
    .sort((left, right) => at(left.startDate) - at(right.startDate))
    .map((sprint) => ({ sprint, span: { start: sprint.startDate, end: sprint.endDate } }))
}

/** The whole grid: the earliest sprint start to the latest sprint end. */
function gridSpan(columns: readonly TimelineColumn[]): Span | null {
  return columns.reduce<Span | null>((span, column) => merge(span, column.span), null)
}

function barOver(span: Span | null, grid: Span | null): TimelineBar | null {
  if (span === null || grid === null) {
    return null
  }
  const width = at(grid.end) - at(grid.start)
  const fraction = (value: Timestamp): number => {
    if (width <= 0) {
      return 0
    }
    return Math.min(1, Math.max(0, (at(value) - at(grid.start)) / width))
  }
  return { span, from: fraction(span.start), to: fraction(span.end) }
}

/** The union of two stretches: the earliest start and the latest end. */
function merge(left: Span | null, right: Span | null): Span | null {
  if (left === null) return right
  if (right === null) return left
  return {
    start: at(left.start) <= at(right.start) ? left.start : right.start,
    end: at(left.end) >= at(right.end) ? left.end : right.end,
  }
}

/**
 * Delivered points over carried points, with the unsized counted in the
 * denominator only.
 *
 * An unestimated child cannot add to what was delivered — nobody said how much
 * it was worth — but leaving it out of the total too would let a sprint report
 * itself complete while holding work nobody sized. It counts as one point, so
 * it can move the bar and cannot be finished by being ignored.
 */
function progressOf(items: readonly WorkItem[]): { delivered: number; total: number } {
  let delivered = 0
  let total = 0
  for (const item of items) {
    const weight = item.estimate ?? 1
    total += weight
    if (isWorkItemFinished(item)) {
      delivered += weight
    }
  }
  return { delivered, total }
}

function spanOf(item: WorkItem, bySprint: Map<SprintId, Span>): Span | null {
  return item.sprintId === null ? null : (bySprint.get(item.sprintId) ?? null)
}

export interface TimelineInput {
  readonly items: readonly WorkItem[]
  readonly sprints: readonly Sprint[]
}

/**
 * The work as a grid of sprints.
 *
 * Dates come from the sprint an item is in and from nowhere else. Scrum work
 * items carry no dates of their own, and demanding them before anything could
 * be drawn would mean asking a team to keep a second schedule beside the one
 * they already run.
 */
export function timelineView(input: TimelineInput): TimelineView {
  const columns = timelineColumns(input.sprints)
  const grid = gridSpan(columns)
  const bySprint = new Map<SprintId, Span>(columns.map((column) => [column.sprint.id, column.span]))
  const byParent = new Map<WorkItemId, WorkItem[]>()
  for (const item of input.items) {
    if (item.parentId !== null) {
      byParent.set(item.parentId, [...(byParent.get(item.parentId) ?? []), item])
    }
  }

  const rowFor = (item: WorkItem): TimelineRow => {
    const children = (byParent.get(item.id) ?? []).map(rowFor)
    const own = spanOf(item, bySprint)
    // An epic has no sprint of its own, so its bar is what its children take:
    // the earliest start among them to the latest end.
    const covered = children.reduce<Span | null>(
      (span, child) => merge(span, child.bar?.span ?? null),
      own,
    )
    const contained = descendants(item, byParent)
    return {
      item,
      bar: barOver(covered, grid),
      children,
      progress: contained.length === 0 ? null : progressOf(contained),
    }
  }

  const loaded = new Set(input.items.map((item) => item.id))
  // A row is a root here when nothing above it was loaded, not only when it
  // has no parent: narrowing to one epic's children must not leave every one
  // of them invisible for want of a parent row.
  const roots = input.items.filter((item) => item.parentId === null || !loaded.has(item.parentId))
  const scheduled = (row: TimelineRow): boolean => row.bar !== null
  const rows = roots.map(rowFor)
  return {
    columns,
    span: grid,
    rows: rows.filter((row) => scheduled(row) || row.item.level === EPIC_LEVEL),
    unscheduled: rows.filter((row) => !scheduled(row) && row.item.level !== EPIC_LEVEL),
  }
}

function descendants(item: WorkItem, byParent: Map<WorkItemId, WorkItem[]>): readonly WorkItem[] {
  const children = byParent.get(item.id) ?? []
  return children.flatMap((child) => [child, ...descendants(child, byParent)])
}
