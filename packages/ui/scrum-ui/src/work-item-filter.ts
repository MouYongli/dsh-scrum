import type {
  IdentityId,
  Priority,
  SprintId,
  WorkItemCategory,
  WorkItemId,
  WorkItemStatus,
  WorkItemType,
} from '@dsh-scrum/scrum-domain'
import type { WorkItem } from '@dsh-scrum/scrum-domain'
import type { BacklogQuery } from './client.js'

/**
 * What every view of the work items is narrowed by.
 *
 * One shape for the list, the backlog and the board, held by the project
 * surface rather than by any page. Three copies would be three definitions of
 * what "this epic, unestimated" means, and a user who narrowed the list would
 * have to say it again on the way to the backlog.
 *
 * Separate from `BacklogQuery`, which is what the wire accepts. This is the
 * user's answer to a screen; that is a request. They differ where a screen
 * asks something the wire has no field for, which is where the difference
 * belongs rather than in a filter that quietly cannot express half of itself.
 */
export interface WorkItemQuery {
  readonly text: string
  readonly types: readonly WorkItemType[]
  readonly categories: readonly WorkItemCategory[]
  readonly statuses: readonly WorkItemStatus[]
  readonly priorities: readonly Priority[]
  readonly labels: readonly string[]
  /** `null` narrows to items nobody is working on. */
  readonly assigneeId?: IdentityId | null | undefined
  /** The epic whose children are wanted, by identifier. */
  readonly epicId?: WorkItemId | undefined
  readonly blocked?: boolean | undefined
}

/*
 * Which sprint is deliberately absent.
 *
 * It is each page's own definition of what it shows rather than something the
 * user typed: a backlog is the work in no sprint, and a board is one sprint's.
 * Carrying it between pages would mean narrowing the list to a sprint and
 * finding the backlog had stopped being a backlog. Pages supply it below.
 */

export const EMPTY_QUERY: WorkItemQuery = {
  text: '',
  types: [],
  categories: [],
  statuses: [],
  priorities: [],
  labels: [],
}

/** What a page shows before the user narrows anything: no sprint scope at all. */
export const ANY_SPRINT = undefined

/** The product backlog: the work in no sprint. */
export const UNPLANNED = null

/**
 * Whether the user narrowed anything.
 *
 * The sprint scope is excluded: it is a screen's own definition of what it
 * shows rather than something the user typed, and counting it would make an
 * empty project report that its filter is too tight.
 */
export function isNarrowed(query: WorkItemQuery): boolean {
  return (
    query.text.trim() !== '' ||
    query.types.length > 0 ||
    query.categories.length > 0 ||
    query.statuses.length > 0 ||
    query.priorities.length > 0 ||
    query.labels.length > 0 ||
    query.assigneeId !== undefined ||
    query.epicId !== undefined ||
    query.blocked !== undefined
  )
}

/**
 * Narrows a loaded set to one epic's descendants.
 *
 * Applied here rather than sent, because it is a question about the shape of
 * the tree and the endpoint answers about one parent at a time. A subtask
 * counts through its own parent, so an epic's grandchildren are included —
 * which is what somebody asking for "this epic" means.
 */
export function underEpic(
  items: readonly WorkItem[],
  epicId: WorkItemId | undefined,
): readonly WorkItem[] {
  if (epicId === undefined) {
    return items
  }
  const byId = new Map(items.map((item) => [item.id, item]))
  const belongs = (item: WorkItem): boolean => {
    let current: WorkItem | undefined = item
    for (let depth = 0; current !== undefined && depth < 3; depth += 1) {
      if (current.id === epicId) return true
      current = current.parentId === null ? undefined : byId.get(current.parentId)
    }
    return false
  }
  return items.filter(belongs)
}

/**
 * The query as the wire takes it.
 *
 * Empty lists are dropped rather than sent: an absent field means "do not
 * narrow by this", and an empty array would ask the host to match nothing.
 *
 * The epic is not sent. Narrowing to one epic's children is a question about
 * the shape of the tree, and the backlog endpoint answers about one parent at
 * a time; it is applied where the whole set is in hand instead.
 */
export function toBacklogQuery(
  query: WorkItemQuery,
  sprintId: SprintId | null | undefined = ANY_SPRINT,
): BacklogQuery {
  return {
    ...(sprintId === undefined ? {} : { sprintId }),
    ...(query.text.trim() === '' ? {} : { text: query.text.trim() }),
    ...(query.types.length === 0 ? {} : { types: query.types }),
    ...(query.categories.length === 0 ? {} : { categories: query.categories }),
    ...(query.statuses.length === 0 ? {} : { statuses: query.statuses }),
    ...(query.priorities.length === 0 ? {} : { priorities: query.priorities }),
    ...(query.assigneeId === undefined ? {} : { assigneeId: query.assigneeId }),
    ...(query.labels.length === 0 ? {} : { labels: query.labels }),
    ...(query.blocked === undefined ? {} : { blocked: query.blocked }),
  }
}
