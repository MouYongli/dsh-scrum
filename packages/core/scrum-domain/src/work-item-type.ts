import { ValidationError } from './errors.js'
import { WORK_ITEM_CATEGORY, type WorkItemCategory } from './work-category.js'

/*
 * The type vocabulary, the level it fixes, and the two things that follow from
 * a level alone. Kept out of the work item aggregate so that a module needing
 * to switch on the type — the per-type details, and anything added beside them
 * — can read it without importing the aggregate back, which `no-circular`
 * refuses and which is what pushed `recommendedTypeFor` away from the category
 * vocabulary it belongs with.
 */

/**
 * The kinds of work a project tracks. Persisted, so the values may be added to
 * but never renamed.
 *
 * Five rather than six: a spike is a task carrying the spike category, not a
 * type of its own. This enum fixes the hierarchy and the fields a type brings
 * with it, and a semantic distinction worth two extra fields would otherwise
 * add a branch to every type check and every type selector in the product.
 */
export const WORK_ITEM_TYPE = {
  epic: 'epic',
  story: 'story',
  task: 'task',
  bug: 'bug',
  subtask: 'subtask',
} as const

export type WorkItemType = (typeof WORK_ITEM_TYPE)[keyof typeof WORK_ITEM_TYPE]

const TYPES: readonly string[] = Object.values(WORK_ITEM_TYPE)

export function toWorkItemType(value: string): WorkItemType {
  if (!TYPES.includes(value)) {
    throw new ValidationError(`WorkItemType must be one of ${TYPES.join(', ')}`, { value })
  }
  return value as WorkItemType
}

/** Where an item sits in the hierarchy: an epic is 1, a subtask is 3. */
export type WorkItemLevel = 1 | 2 | 3

/**
 * The level each type occupies.
 *
 * The three level 2 types are peers. A bug is not filed under the story it
 * affects: a defect and the requirement it breaks reference one another, and
 * hanging the first under the second folds the cost of the defect into the
 * progress of the requirement, which is where defect statistics start to lie.
 */
export const WORK_ITEM_LEVEL = {
  [WORK_ITEM_TYPE.epic]: 1,
  [WORK_ITEM_TYPE.story]: 2,
  [WORK_ITEM_TYPE.task]: 2,
  [WORK_ITEM_TYPE.bug]: 2,
  [WORK_ITEM_TYPE.subtask]: 3,
} as const satisfies Record<WorkItemType, WorkItemLevel>

export function workItemLevel(type: WorkItemType): WorkItemLevel {
  return WORK_ITEM_LEVEL[type]
}

const SUBTASK_LEVEL = 3

/**
 * Whether an item at this level is meaningless on its own.
 *
 * Only a level 3 item is. An epic tops the hierarchy and a level 2 item is
 * deliverable by itself, but a subtask is a breakdown of something, so one
 * with nothing above it names no work anybody agreed to do.
 */
export function workItemRequiresParent(level: WorkItemLevel): boolean {
  return level === SUBTASK_LEVEL
}

/**
 * The type each category suggests when an item is created.
 *
 * A suggestion and not a rule. The judgement behind it — whether the work is
 * visible to a user and separately deliverable — falls differently between
 * teams on the boundary cases, and "the page loads within three seconds" is a
 * story in one team and a task in the next. Enforcing it would turn a team
 * convention into a form somebody cannot complete.
 */
const RECOMMENDED_TYPE = {
  [WORK_ITEM_CATEGORY.feature]: WORK_ITEM_TYPE.story,
  [WORK_ITEM_CATEGORY.nfrVisible]: WORK_ITEM_TYPE.story,
  [WORK_ITEM_CATEGORY.nfrConstraint]: WORK_ITEM_TYPE.task,
  [WORK_ITEM_CATEGORY.techDebt]: WORK_ITEM_TYPE.task,
  [WORK_ITEM_CATEGORY.spike]: WORK_ITEM_TYPE.task,
  [WORK_ITEM_CATEGORY.ops]: WORK_ITEM_TYPE.task,
  [WORK_ITEM_CATEGORY.docs]: WORK_ITEM_TYPE.task,
  [WORK_ITEM_CATEGORY.defect]: WORK_ITEM_TYPE.bug,
} as const satisfies Record<WorkItemCategory, WorkItemType>

export function recommendedTypeFor(category: WorkItemCategory): WorkItemType {
  return RECOMMENDED_TYPE[category]
}
