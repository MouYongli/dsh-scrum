import { describe, expect, it } from 'vitest'
import { PRIORITY, WORK_ITEM_CATEGORY, WORK_ITEM_TYPE } from '@dsh-scrum/scrum-domain'
import { BACKLOG_GROUPING, backlogPage, priorityLabel, typeLabel } from '@dsh-scrum/scrum-ui'
import { item, itemId } from '../support/items.js'

describe('what one backlog row reports', () => {
  it('derives blocking from the reason, never from a second flag', () => {
    const [row] = backlogPage([item(1, { blockedReason: '等待接口' })], 'none', false).groups[0]!
      .rows

    expect(row?.blocked).toBe(true)
    expect(backlogPage([item(1)], 'none', false).groups[0]?.rows[0]?.blocked).toBe(false)
  })

  it('counts satisfied criteria against the total, so partial progress shows', () => {
    const page = backlogPage(
      [
        item(1, {
          acceptanceCriteria: [
            { text: '可以创建', satisfied: true },
            { text: '可以编辑', satisfied: false },
          ],
        }),
      ],
      'none',
      false,
    )

    expect(page.groups[0]?.rows[0]?.criteria).toEqual({ satisfied: 1, total: 2 })
  })

  it('reports how many dependencies an item declares', () => {
    const page = backlogPage([item(1, { dependsOn: [itemId(2)] })], 'none', false)

    expect(page.groups[0]?.rows[0]?.dependencies).toBe(1)
  })
})

describe('the totals under a group', () => {
  it('adds the estimates and counts the unestimated beside them', () => {
    const page = backlogPage(
      [item(1, { estimate: 3 }), item(2), item(3, { estimate: 5 })],
      'none',
      false,
    )

    expect(page.groups[0]?.totals).toEqual({ count: 3, estimate: 8, unestimated: 1 })
  })
})

describe('grouping', () => {
  it('keeps rank order inside a group, because that order is a decision', () => {
    const page = backlogPage([item(1), item(2), item(3)], 'none', false)

    expect(page.groups[0]?.rows.map((row) => row.item.id)).toEqual([
      itemId(1),
      itemId(2),
      itemId(3),
    ])
  })

  it('orders type groups by the vocabulary, not by what happens to arrive first', () => {
    const page = backlogPage(
      [item(1, { type: WORK_ITEM_TYPE.bug }), item(2, { type: WORK_ITEM_TYPE.epic })],
      BACKLOG_GROUPING.type,
      false,
    )

    expect(page.groups.map((group) => group.key)).toEqual([WORK_ITEM_TYPE.epic, WORK_ITEM_TYPE.bug])
  })

  it('puts the most urgent priority first, not the order the domain declares', () => {
    const page = backlogPage(
      [
        item(1, { priority: PRIORITY.low }),
        item(2, { priority: PRIORITY.critical }),
        item(3, { priority: PRIORITY.medium }),
      ],
      BACKLOG_GROUPING.priority,
      false,
    )

    expect(page.groups.map((group) => group.key)).toEqual([
      PRIORITY.critical,
      PRIORITY.medium,
      PRIORITY.low,
    ])
  })

  it('drops a bucket nothing landed in, rather than showing an empty heading', () => {
    const page = backlogPage([item(1, { type: WORK_ITEM_TYPE.task })], BACKLOG_GROUPING.type, false)

    expect(page.groups).toHaveLength(1)
    expect(page.groups[0]?.label).toEqual({ kind: 'message', key: typeLabel(WORK_ITEM_TYPE.task) })
  })

  it('heads a parent group with the parent title when the parent was loaded', () => {
    const page = backlogPage(
      [item(1, { title: '结算史诗', type: WORK_ITEM_TYPE.epic }), item(2, { parentId: itemId(1) })],
      BACKLOG_GROUPING.parent,
      false,
    )

    expect(page.groups.map((group) => group.label)).toEqual([
      { kind: 'message', key: 'backlog.group.unparented' },
      { kind: 'text', text: 'SCR-1 · 结算史诗' },
    ])
  })

  it('heads a parent group with the identifier alone when the parent was filtered out', () => {
    const page = backlogPage([item(2, { parentId: itemId(9) })], BACKLOG_GROUPING.parent, false)

    expect(page.groups[0]?.label).toEqual({ kind: 'text', text: 'SCR-9 ·' })
  })

  it('names the priority labels it groups by', () => {
    expect(priorityLabel(PRIORITY.critical)).toBe('priority.critical')
  })
})

describe('an empty list', () => {
  it('separates a project with nothing in it from a filter that matched nothing', () => {
    expect(backlogPage([], 'none', false).emptiness).toBe('no-items')
    expect(backlogPage([], 'none', true).emptiness).toBe('no-matches')
  })

  it('reports no groups at all, rather than one empty group', () => {
    expect(backlogPage([], BACKLOG_GROUPING.type, false).groups).toEqual([])
  })

  it('reports items as present the moment there is one', () => {
    expect(backlogPage([item(1)], 'none', true).emptiness).toBe('items')
  })
})

describe('subtasks in the list', () => {
  it('folds a subtask into its parent rather than beside it', () => {
    const page = backlogPage(
      [
        item(1, { title: '结算', type: WORK_ITEM_TYPE.story }),
        item(2, { title: '拆一半', type: WORK_ITEM_TYPE.subtask, parentId: itemId(1) }),
      ],
      BACKLOG_GROUPING.none,
      false,
    )
    const [row] = page.groups[0]?.rows ?? []

    // A subtask is a breakdown of one item. Listed beside the things it breaks
    // down, the order the product owner set would read as ranking both.
    expect(page.groups[0]?.rows).toHaveLength(1)
    expect(row?.item.id).toBe(itemId(1))
    expect(row?.subtasks.map((one) => one.id)).toEqual([itemId(2)])
  })

  it('keeps a subtask visible when its parent was filtered out', () => {
    const page = backlogPage(
      [item(2, { type: WORK_ITEM_TYPE.subtask, parentId: itemId(9) })],
      BACKLOG_GROUPING.none,
      true,
    )

    // Folding it under a parent nobody can see would hide it; dropping it
    // would report a shorter backlog than the project has.
    expect(page.groups[0]?.rows.map((row) => row.item.id)).toEqual([itemId(2)])
  })
})

describe('grouping by the kind of work', () => {
  it('puts each category in the documented order and names the unclassified', () => {
    const page = backlogPage(
      [
        item(1, { category: WORK_ITEM_CATEGORY.techDebt }),
        item(2, {}),
        item(3, { category: WORK_ITEM_CATEGORY.feature }),
      ],
      BACKLOG_GROUPING.category,
      false,
    )

    expect(page.groups.map((group) => group.key)).toEqual([
      WORK_ITEM_CATEGORY.feature,
      WORK_ITEM_CATEGORY.techDebt,
      'uncategorised',
    ])
    // An item nobody classified is still work; a grouping that dropped it
    // would report a backlog shorter than the one the project has.
    expect(page.groups.at(-1)?.rows.map((row) => row.item.id)).toEqual([itemId(2)])
  })
})
