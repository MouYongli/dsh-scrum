import { describe, expect, it } from 'vitest'
import {
  ERROR_CODE,
  WORK_ITEM_TYPE,
  addWorkItemDependency,
  assertWorkItemDeletable,
  createWorkItem,
  isScrumError,
  rankBetween,
  removeWorkItemDependency,
  setWorkItemParent,
  toIdentityId,
  toProjectId,
  toTimestamp,
  toWorkItemId,
  workItemReferences,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const OTHER_ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABW'
const PROJECT = toProjectId(`prj_${ULID}`)
const OTHER_PROJECT = toProjectId(`prj_${OTHER_ULID}`)
const REPORTER = toIdentityId(`idt_${ULID}`)
const T1 = toTimestamp('2026-08-20T10:00:00Z')
const T2 = toTimestamp('2026-08-20T11:00:00Z')
const T3 = toTimestamp('2026-08-20T12:00:00Z')

function caughtFrom(run: () => unknown): unknown {
  try {
    run()
    return undefined
  } catch (error) {
    return error
  }
}

function expectRejects(run: () => unknown, what: string): void {
  const error = caughtFrom(run)
  expect(isScrumError(error) && error.code, `expected ${what} to be rejected`).toBe(
    ERROR_CODE.validation,
  )
}

function item(key: string, projectId = PROJECT): WorkItem {
  return createWorkItem({
    id: toWorkItemId(key),
    projectId,
    type: WORK_ITEM_TYPE.task,
    title: key,
    reporterId: REPORTER,
    rank: rankBetween(null, null),
    now: T1,
  })
}

// A plain map satisfies the lookup port, which is the point: the domain never
// learns where items are stored.
function lookup(...items: readonly WorkItem[]): ReadonlyMap<WorkItemId, WorkItem> {
  return new Map(items.map((entry) => [entry.id, entry]))
}

describe('parent links', () => {
  it('links to a parent and detaches again', () => {
    const parent = item('SCR-1')
    const child = item('SCR-2')
    const linked = setWorkItemParent(child, parent.id, lookup(parent, child), T2)
    const detached = setWorkItemParent(linked, null, lookup(parent, linked), T3)

    expect(linked.parentId).toBe(parent.id)
    expect(linked.revision).toBe(2)
    expect(detached.parentId).toBeNull()
  })

  it('refuses itself, a parent that is missing, and one in another project', () => {
    const child = item('SCR-2')
    const foreign = item('SCR-3', OTHER_PROJECT)

    expectRejects(
      () => setWorkItemParent(child, child.id, lookup(child), T2),
      'an item as its own parent',
    )
    expectRejects(
      () => setWorkItemParent(child, toWorkItemId('SCR-9'), lookup(child), T2),
      'a parent that does not exist',
    )
    expectRejects(
      () => setWorkItemParent(child, foreign.id, lookup(child, foreign), T2),
      'a parent in another project',
    )
    expectRejects(
      () => setWorkItemParent(child, null, lookup(child), T2),
      'detaching what has no parent',
    )
  })

  // The pair a one-step check would catch is the easy case. This one closes
  // the loop three links up, which only a walk of the ancestry finds.
  it('refuses a link that closes a cycle further up the chain', () => {
    const top = item('SCR-1')
    const middle = setWorkItemParent(item('SCR-2'), top.id, lookup(top, item('SCR-2')), T2)
    const bottom = setWorkItemParent(item('SCR-3'), middle.id, lookup(middle, item('SCR-3')), T2)

    const error = caughtFrom(() =>
      setWorkItemParent(top, bottom.id, lookup(top, middle, bottom), T3),
    )

    // The details are asserted, not just the code: every other refusal here is
    // also a validation error, so a code-only check would pass for the wrong
    // reason if the walk were removed.
    expect(isScrumError(error) && error.details['throughId']).toBe(bottom.id)
  })
})

describe('dependency links', () => {
  it('records and removes a dependency', () => {
    const waiting = item('SCR-1')
    const target = item('SCR-2')
    const linked = addWorkItemDependency(waiting, target.id, lookup(waiting, target), T2)
    const removed = removeWorkItemDependency(linked, target.id, T3)

    expect(linked.dependsOn).toEqual([target.id])
    expect(removed.dependsOn).toEqual([])
  })

  it('refuses itself, a duplicate, a missing target and one in another project', () => {
    const waiting = item('SCR-1')
    const target = item('SCR-2')
    const foreign = item('SCR-3', OTHER_PROJECT)
    const linked = addWorkItemDependency(waiting, target.id, lookup(waiting, target), T2)

    expectRejects(
      () => addWorkItemDependency(waiting, waiting.id, lookup(waiting), T2),
      'an item depending on itself',
    )
    expectRejects(
      () => addWorkItemDependency(linked, target.id, lookup(linked, target), T3),
      'a duplicate dependency',
    )
    expectRejects(
      () => addWorkItemDependency(waiting, toWorkItemId('SCR-9'), lookup(waiting), T2),
      'a dependency that does not exist',
    )
    expectRejects(
      () => addWorkItemDependency(waiting, foreign.id, lookup(waiting, foreign), T2),
      'a dependency in another project',
    )
    expectRejects(
      () => removeWorkItemDependency(waiting, target.id, T2),
      'removing a dependency that is not recorded',
    )
  })

  // Dependencies form a graph rather than a chain, so the cycle can close
  // through a branch that the direct link never touches.
  it('refuses a dependency that closes a cycle through the graph', () => {
    const first = item('SCR-1')
    const second = item('SCR-2')
    const third = item('SCR-3')
    const secondOnThird = addWorkItemDependency(second, third.id, lookup(second, third), T2)
    const firstOnSecond = addWorkItemDependency(
      first,
      secondOnThird.id,
      lookup(first, secondOnThird),
      T2,
    )

    expectRejects(
      () =>
        addWorkItemDependency(
          third,
          firstOnSecond.id,
          lookup(firstOnSecond, secondOnThird, third),
          T3,
        ),
      'a dependency that closes a cycle',
    )
  })

  it('tolerates a dependency whose target is missing from the index', () => {
    const dangling = { ...item('SCR-2'), dependsOn: [toWorkItemId('SCR-9')] }
    const waiting = item('SCR-1')

    expect(
      addWorkItemDependency(waiting, dangling.id, lookup(waiting, dangling), T2).dependsOn,
    ).toEqual([dangling.id])
  })
})

describe('deletion protection', () => {
  it('reports the children and dependants that block a deletion', () => {
    const target = item('SCR-1')
    const child = setWorkItemParent(item('SCR-2'), target.id, lookup(target, item('SCR-2')), T2)
    const dependant = addWorkItemDependency(
      item('SCR-3'),
      target.id,
      lookup(target, item('SCR-3')),
      T2,
    )
    const all = [target, child, dependant]

    expect(workItemReferences(target, all)).toEqual({
      children: [child.id],
      dependants: [dependant.id],
    })

    const error = caughtFrom(() => assertWorkItemDeletable(target, all))
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
    expect(isScrumError(error) && error.details['children']).toEqual([child.id])
    expect(isScrumError(error) && error.details['dependants']).toEqual([dependant.id])
  })

  it('allows a deletion once nothing points at the item', () => {
    const target = item('SCR-1')

    expect(workItemReferences(target, [target])).toEqual({ children: [], dependants: [] })
    expect(
      caughtFrom(() => assertWorkItemDeletable(target, [target, item('SCR-2')])),
    ).toBeUndefined()
  })
})
