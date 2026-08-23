import { ValidationError } from './errors.js'
import type { WorkItemId } from './ids.js'
import { touchEntityMetadata } from './metadata.js'
import type { Timestamp } from './time.js'
import {
  workItemLevel,
  workItemRequiresParent,
  type WorkItem,
  type WorkItemLevel,
  type WorkItemType,
} from './work-item.js'

// A store that already contains a cycle would otherwise walk forever. The
// bounds turn corrupted data into a rejected write naming the item it gave up
// on, which is a repairable failure rather than a hung process.
const MAX_ANCESTRY_DEPTH = 100
const MAX_VISITED_DEPENDENCIES = 10000

/**
 * Read access to the other items a relationship rule has to consult. A
 * `ReadonlyMap<WorkItemId, WorkItem>` satisfies this structurally, so the
 * caller passes its index straight in and the domain stays unaware of where
 * items are stored.
 */
export interface WorkItemLookup {
  get(id: WorkItemId): WorkItem | undefined
}

function requireItem(items: WorkItemLookup, id: WorkItemId, relation: string): WorkItem {
  const found = items.get(id)
  if (found === undefined) {
    throw new ValidationError(`the ${relation} does not exist`, { workItemId: id })
  }
  return found
}

function requireSameProject(item: WorkItem, other: WorkItem, relation: string): void {
  if (item.projectId !== other.projectId) {
    throw new ValidationError(`a ${relation} must be in the same project`, {
      workItemId: item.id,
      otherId: other.id,
    })
  }
}

/**
 * Whether a parent sits exactly one level above the child it is proposed for.
 *
 * The whole parent rule, in one comparison. Expressing it over levels rather
 * than over pairs of types is what lets a level be added above `epic` later
 * without revisiting anything: an epic already cannot have a parent, because
 * nothing is at level 0 to be one.
 */
function isAdjacentLevel(childLevel: WorkItemLevel, parentLevel: WorkItemLevel): boolean {
  return parentLevel === childLevel - 1
}

/**
 * The parent rule, for a caller holding a child that is not stored yet. The
 * creation path needs it, because the domain settles there only whether a
 * parent had to be named, not whether the one named can hold this item.
 */
export function assertWorkItemParent(childLevel: WorkItemLevel, parent: WorkItem): void {
  if (!isAdjacentLevel(childLevel, parent.level)) {
    throw new ValidationError('a parent sits exactly one level above its child', {
      childLevel,
      parentId: parent.id,
      parentLevel: parent.level,
    })
  }
}

/**
 * Links an item to its parent, or detaches it. A cycle is refused by walking
 * the proposed ancestry: if the item is already above the candidate parent,
 * the link would close a loop that no traversal could terminate on.
 *
 * The level check is not a second cycle guard but the structural rule: a story
 * belongs under an epic and a subtask under a story, task or bug, and a link
 * that skipped a level would leave the epic's roll-up counting work at two
 * different granularities.
 */
export function setWorkItemParent(
  item: WorkItem,
  parentId: WorkItemId | null,
  items: WorkItemLookup,
  now: Timestamp,
): WorkItem {
  if (parentId === item.parentId) {
    throw new ValidationError('item already has this parent', { workItemId: item.id, parentId })
  }
  if (parentId === null) {
    if (workItemRequiresParent(item.level)) {
      throw new ValidationError('a subtask cannot be left without the item it breaks down', {
        workItemId: item.id,
      })
    }
  } else {
    if (parentId === item.id) {
      throw new ValidationError('an item cannot be its own parent', { workItemId: item.id })
    }
    const parent = requireItem(items, parentId, 'parent')
    requireSameProject(item, parent, 'parent')
    assertWorkItemParent(item.level, parent)
    assertNotAnAncestor(item.id, parent, items)
  }
  return { ...item, ...touchEntityMetadata(item, now), parentId }
}

/**
 * Whether an item can become this type without breaking what hangs off it.
 *
 * A type change that stays on one level touches nothing structural and is
 * always allowed. One that crosses a level is a move within the hierarchy, so
 * the parent above and the children below have to still sit one level away
 * afterwards — otherwise a story promoted to an epic would keep a parent epic
 * above it, and the tree would have two levels of the same kind.
 *
 * Checked here rather than in `updateWorkItemDetails`, which cannot read the
 * items this consults.
 */
export function assertWorkItemTypeChange(
  item: WorkItem,
  nextType: WorkItemType,
  items: Iterable<WorkItem>,
): void {
  const nextLevel = workItemLevel(nextType)
  if (nextLevel === item.level) {
    return
  }
  const all = [...items]
  const parent = all.find((other) => other.id === item.parentId) ?? null
  if (parent === null) {
    if (workItemRequiresParent(nextLevel)) {
      throw new ValidationError('a subtask breaks down an item, so one has to be above it', {
        workItemId: item.id,
        nextType,
      })
    }
  } else {
    assertWorkItemParent(nextLevel, parent)
  }
  for (const child of all) {
    if (child.parentId === item.id && !isAdjacentLevel(child.level, nextLevel)) {
      throw new ValidationError('an item under this one would no longer sit one level below', {
        workItemId: item.id,
        nextType,
        childId: child.id,
        childLevel: child.level,
      })
    }
  }
}

function assertNotAnAncestor(
  descendantId: WorkItemId,
  from: WorkItem,
  items: WorkItemLookup,
): void {
  let current: WorkItem | undefined = from
  for (let depth = 0; depth < MAX_ANCESTRY_DEPTH; depth += 1) {
    if (current === undefined) {
      return
    }
    if (current.id === descendantId) {
      throw new ValidationError('the link would close a parent cycle', {
        workItemId: descendantId,
        throughId: from.id,
      })
    }
    current = current.parentId === null ? undefined : items.get(current.parentId)
  }
  throw new ValidationError('the parent chain is longer than this build will walk', {
    workItemId: descendantId,
    maxDepth: MAX_ANCESTRY_DEPTH,
  })
}

/**
 * Records that this item waits on another. Dependencies form a directed graph
 * rather than a chain, so the cycle check is a traversal of everything the
 * target already waits on.
 */
export function addWorkItemDependency(
  item: WorkItem,
  dependsOnId: WorkItemId,
  items: WorkItemLookup,
  now: Timestamp,
): WorkItem {
  if (dependsOnId === item.id) {
    throw new ValidationError('an item cannot depend on itself', { workItemId: item.id })
  }
  if (item.dependsOn.includes(dependsOnId)) {
    throw new ValidationError('item already depends on this one', {
      workItemId: item.id,
      dependsOnId,
    })
  }
  const target = requireItem(items, dependsOnId, 'dependency')
  requireSameProject(item, target, 'dependency')
  assertDoesNotReach(item.id, target, items)
  return {
    ...item,
    ...touchEntityMetadata(item, now),
    dependsOn: [...item.dependsOn, dependsOnId],
  }
}

function assertDoesNotReach(originId: WorkItemId, from: WorkItem, items: WorkItemLookup): void {
  const pending: WorkItem[] = [from]
  const seen = new Set<WorkItemId>()

  while (pending.length > 0) {
    const current = pending.pop() as WorkItem
    if (current.id === originId) {
      throw new ValidationError('the dependency would close a cycle', {
        workItemId: originId,
        throughId: from.id,
      })
    }
    if (seen.has(current.id)) {
      continue
    }
    seen.add(current.id)
    if (seen.size > MAX_VISITED_DEPENDENCIES) {
      throw new ValidationError('the dependency graph is larger than this build will walk', {
        workItemId: originId,
        maxVisited: MAX_VISITED_DEPENDENCIES,
      })
    }
    for (const nextId of current.dependsOn) {
      const next = items.get(nextId)
      if (next !== undefined) {
        pending.push(next)
      }
    }
  }
}

export function removeWorkItemDependency(
  item: WorkItem,
  dependsOnId: WorkItemId,
  now: Timestamp,
): WorkItem {
  if (!item.dependsOn.includes(dependsOnId)) {
    throw new ValidationError('item does not depend on this one', {
      workItemId: item.id,
      dependsOnId,
    })
  }
  return {
    ...item,
    ...touchEntityMetadata(item, now),
    dependsOn: item.dependsOn.filter((id) => id !== dependsOnId),
  }
}

/** What still points at an item, which is what stops it being deleted. */
export interface WorkItemReferences {
  readonly children: readonly WorkItemId[]
  readonly dependants: readonly WorkItemId[]
}

export function workItemReferences(item: WorkItem, items: Iterable<WorkItem>): WorkItemReferences {
  const children: WorkItemId[] = []
  const dependants: WorkItemId[] = []
  for (const other of items) {
    if (other.id === item.id) {
      continue
    }
    if (other.parentId === item.id) {
      children.push(other.id)
    }
    if (other.dependsOn.includes(item.id)) {
      dependants.push(other.id)
    }
  }
  return { children, dependants }
}

/**
 * Deletion protection. The blockers travel with the refusal so the caller can
 * tell the user what to detach, rather than reporting that deletion failed and
 * leaving them to find out why.
 */
export function assertWorkItemDeletable(item: WorkItem, items: Iterable<WorkItem>): void {
  const { children, dependants } = workItemReferences(item, items)
  if (children.length > 0 || dependants.length > 0) {
    throw new ValidationError('other items still reference this one', {
      workItemId: item.id,
      children: [...children],
      dependants: [...dependants],
    })
  }
}
