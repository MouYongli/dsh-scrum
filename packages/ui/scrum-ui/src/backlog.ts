import {
  isWorkItemBlocked,
  workItemRequiresParent,
  type WorkItem,
  type WorkItemCategory,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import type { MessageKey } from './messages.js'
import {
  PRIORITIES,
  WORK_ITEM_CATEGORIES,
  WORK_ITEM_TYPES,
  categoryLabel,
  priorityLabel,
  typeLabel,
} from './vocabulary.js'

/**
 * How the list is broken up.
 *
 * `parent` is the Scrum-shaped one: an epic and the stories under it. The
 * other two are flat partitions of the same rows. None of them reorders
 * anything — rank order holds inside every group, because the order is what
 * the product owner decided and a grouping that resorted it would be showing a
 * priority nobody set.
 */
export const BACKLOG_GROUPING = {
  none: 'none',
  type: 'type',
  category: 'category',
  priority: 'priority',
  parent: 'parent',
} as const

export type BacklogGrouping = (typeof BACKLOG_GROUPING)[keyof typeof BACKLOG_GROUPING]

/** A group heading is either a fixed word or a work item's own title. */
export type GroupLabel =
  | { readonly kind: 'message'; readonly key: MessageKey }
  | { readonly kind: 'text'; readonly text: string }

export interface BacklogRow {
  readonly item: WorkItem
  readonly blocked: boolean
  /** Satisfied acceptance criteria over the total, for the list line. */
  readonly criteria: { readonly satisfied: number; readonly total: number }
  readonly dependencies: number
  /**
   * The subtasks broken out of this item, in rank order.
   *
   * They travel with the row rather than as rows of their own. A subtask is a
   * breakdown of one item, so a flat list would put a decomposition beside the
   * things being decomposed, and the ordering the product owner set would read
   * as if it ranked both against each other.
   */
  readonly subtasks: readonly WorkItem[]
}

export interface GroupTotals {
  readonly count: number
  readonly estimate: number
  /** Counted, never folded into the estimate. See `SprintProgress`. */
  readonly unestimated: number
}

export interface BacklogGroup {
  /** Stable across renders, so a collapsed group stays collapsed. */
  readonly key: string
  readonly label: GroupLabel
  readonly rows: readonly BacklogRow[]
  readonly totals: GroupTotals
}

/**
 * Why the list is empty.
 *
 * A project with no work items and a filter that matched nothing look the same
 * on screen and are not the same situation: one asks the user to create
 * something, the other to widen the filter. Collapsing them into one empty
 * state is how a user ends up believing their backlog was lost.
 */
export type BacklogEmptiness = 'items' | 'no-items' | 'no-matches'

export interface BacklogPage {
  readonly groups: readonly BacklogGroup[]
  readonly total: number
  readonly emptiness: BacklogEmptiness
}

function rowOf(item: WorkItem, subtasks: readonly WorkItem[]): BacklogRow {
  return {
    item,
    blocked: isWorkItemBlocked(item),
    criteria: {
      satisfied: item.acceptanceCriteria.filter((criterion) => criterion.satisfied).length,
      total: item.acceptanceCriteria.length,
    },
    dependencies: item.dependsOn.length,
    subtasks,
  }
}

/**
 * Turns a flat list into rows with their subtasks folded in.
 *
 * A subtask whose parent is not in the loaded set keeps a row of its own. It
 * has to appear somewhere: folding it under a parent nobody can see would hide
 * it, and dropping it would report a shorter backlog than the project has.
 */
function foldSubtasks(items: readonly WorkItem[]): readonly BacklogRow[] {
  const shown = new Set(items.map((item) => item.id))
  const folded = (item: WorkItem): boolean =>
    workItemRequiresParent(item.level) && item.parentId !== null && shown.has(item.parentId)

  const under = new Map<WorkItemId, WorkItem[]>()
  for (const item of items.filter(folded)) {
    const parentId = item.parentId as WorkItemId
    under.set(parentId, [...(under.get(parentId) ?? []), item])
  }
  return items.filter((item) => !folded(item)).map((item) => rowOf(item, under.get(item.id) ?? []))
}

function totalsOf(rows: readonly BacklogRow[]): GroupTotals {
  return {
    count: rows.length,
    estimate: rows.reduce((sum, row) => sum + (row.item.estimate ?? 0), 0),
    unestimated: rows.filter((row) => row.item.estimate === null).length,
  }
}

/**
 * Partitions rows, keeping the order they arrived in.
 *
 * The bucket order comes from the caller's key list rather than from the order
 * items happen to appear in, so an empty priority still sits between the two
 * that surround it and the list does not reshuffle its headings as items move.
 */
function partition<Key extends string>(
  rows: readonly BacklogRow[],
  keys: readonly Key[],
  keyOf: (row: BacklogRow) => Key,
  label: (key: Key) => GroupLabel,
): readonly BacklogGroup[] {
  return keys
    .map((key) => {
      const inGroup = rows.filter((row) => keyOf(row) === key)
      return { key, label: label(key), rows: inGroup, totals: totalsOf(inGroup) }
    })
    .filter((group) => group.rows.length > 0)
}

/**
 * The items nobody classified, as a group of their own at the end.
 *
 * Named rather than left out: an item with no category is still work, and a
 * grouping that silently dropped it would report a backlog shorter than the
 * one the project has.
 */
function unclassified(rows: readonly BacklogRow[]): readonly BacklogGroup[] {
  const inGroup = rows.filter((row) => row.item.category === null)
  if (inGroup.length === 0) {
    return []
  }
  return [
    {
      key: 'uncategorised',
      label: { kind: 'message', key: categoryLabel(null) },
      rows: inGroup,
      totals: totalsOf(inGroup),
    },
  ]
}

/**
 * Groups by parent, in the order the parents themselves are ranked.
 *
 * A parent that is not in the loaded set still gets a group, headed by the
 * identifier rather than a title nobody read. Guessing a title from an item
 * that was filtered out would mean showing the user a heading the screen
 * cannot stand behind.
 */
function byParent(rows: readonly BacklogRow[]): readonly BacklogGroup[] {
  const titles = new Map<WorkItemId, string>(rows.map((row) => [row.item.id, row.item.title]))
  const order: (WorkItemId | null)[] = []
  for (const row of rows) {
    const parent = row.item.parentId
    if (!order.includes(parent)) {
      order.push(parent)
    }
  }
  return order.map((parent) => {
    const inGroup = rows.filter((row) => row.item.parentId === parent)
    return {
      key: parent ?? 'unparented',
      label:
        parent === null
          ? ({ kind: 'message', key: 'backlog.group.unparented' } as const)
          : ({ kind: 'text', text: `${parent} · ${titles.get(parent) ?? ''}`.trim() } as const),
      rows: inGroup,
      totals: totalsOf(inGroup),
    }
  })
}

/**
 * Turns what the client returned into what the screen draws.
 *
 * `filtered` says whether the query narrowed anything, which is the only way
 * to tell an empty project from an over-narrow filter: the rows are identical
 * in both cases, and only the caller knows what it asked for.
 */
export function backlogPage(
  items: readonly WorkItem[],
  grouping: BacklogGrouping,
  filtered: boolean,
): BacklogPage {
  const rows = foldSubtasks(items)
  const emptiness: BacklogEmptiness =
    rows.length > 0 ? 'items' : filtered ? 'no-matches' : 'no-items'
  return { groups: groupRows(rows, grouping), total: rows.length, emptiness }
}

function groupRows(
  rows: readonly BacklogRow[],
  grouping: BacklogGrouping,
): readonly BacklogGroup[] {
  if (rows.length === 0) {
    return []
  }
  switch (grouping) {
    case BACKLOG_GROUPING.none:
      return [
        {
          key: 'all',
          label: { kind: 'message', key: 'backlog.group.all' },
          rows,
          totals: totalsOf(rows),
        },
      ]
    case BACKLOG_GROUPING.type:
      return partition(
        rows,
        WORK_ITEM_TYPES,
        (row) => row.item.type,
        (type) => ({ kind: 'message', key: typeLabel(type) }),
      )
    case BACKLOG_GROUPING.category: {
      const classified = rows.filter((row) => row.item.category !== null)
      return [
        ...partition(
          classified,
          WORK_ITEM_CATEGORIES,
          (row) => row.item.category as WorkItemCategory,
          (category) => ({ kind: 'message', key: categoryLabel(category) }),
        ),
        ...unclassified(rows),
      ]
    }
    case BACKLOG_GROUPING.priority:
      return partition(
        rows,
        PRIORITIES,
        (row) => row.item.priority,
        (priority) => ({ kind: 'message', key: priorityLabel(priority) }),
      )
    case BACKLOG_GROUPING.parent:
      return byParent(rows)
  }
}
