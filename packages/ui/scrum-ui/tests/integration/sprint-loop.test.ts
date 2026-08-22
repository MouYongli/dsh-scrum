import { describe, expect, it } from 'vitest'
import {
  ConflictError,
  SPRINT_STATUS,
  WORK_ITEM_STATUS,
  toRevision,
  toTimestamp,
  type Sprint,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'
import { createSprintController } from '@dsh-scrum/scrum-ui'
import { stubClient } from '../support/client.js'
import { item, itemId, sprint, sprintId } from '../support/items.js'

// One turn of the Scrum loop through the controller: plan work into a sprint,
// start it, advance a card, and close it with the leftovers placed. The store
// is a small mutable stand-in, so every step is read back the way the screen
// reads it.

function store() {
  let current: Sprint = sprint(1)
  let items: WorkItem[] = [item(1), item(2)]
  return {
    client: stubClient({
      sprints: () => Promise.resolve([current]),
      backlog: (query) =>
        Promise.resolve(
          items.filter((entry) =>
            query?.sprintId === undefined ? true : entry.sprintId === query.sprintId,
          ),
        ),
      planSprint: (command) => {
        const planned = command.items.map((ref) => ref.workItemId)
        items = items.map((entry) =>
          planned.includes(entry.id)
            ? {
                ...entry,
                sprintId: command.sprintId,
                status:
                  command.sprintId === null ? WORK_ITEM_STATUS.backlog : WORK_ITEM_STATUS.todo,
                revision: toRevision(entry.revision + 1),
              }
            : entry,
        )
        return Promise.resolve(items)
      },
      startSprint: () => {
        current = { ...current, status: SPRINT_STATUS.active, revision: toRevision(2) }
        return Promise.resolve(current)
      },
      moveWorkItemStatus: (command) => {
        items = items.map((entry) =>
          entry.id === command.workItemId
            ? { ...entry, status: command.status, revision: toRevision(entry.revision + 1) }
            : entry,
        )
        return Promise.resolve(items[0]!)
      },
      closeSprint: (command) => {
        for (const disposition of command.dispositions) {
          items = items.map((entry) =>
            entry.id === disposition.workItemId
              ? { ...entry, sprintId: disposition.moveTo, status: WORK_ITEM_STATUS.backlog }
              : entry,
          )
        }
        current = { ...current, status: SPRINT_STATUS.closed, revision: toRevision(3) }
        return Promise.resolve(current)
      },
    }),
    itemsNow: () => items,
  }
}

describe('one turn of the sprint loop', () => {
  it('plans, starts, advances and closes, and places what was left', async () => {
    const { client, itemsNow } = store()
    const controller = createSprintController(client)
    await controller.load()

    expect(controller.state().unplanned).toHaveLength(2)

    await controller.plan(
      [
        { workItemId: itemId(1), expectedRevision: toRevision(1) },
        { workItemId: itemId(2), expectedRevision: toRevision(1) },
      ],
      sprintId(1),
    )

    expect(controller.state().board.total.count).toBe(2)
    expect(controller.state().unplanned).toHaveLength(0)

    controller.ask('start')
    await controller.start()

    expect(controller.state().selected?.status).toBe(SPRINT_STATUS.active)

    await controller.move(
      { workItemId: itemId(1), expectedRevision: toRevision(2) },
      WORK_ITEM_STATUS.done,
    )

    controller.ask('close')
    const confirmation = controller.state().confirmation

    // Only the unfinished one has to be placed.
    expect(
      confirmation?.kind === 'close' ? confirmation.unfinished.map((entry) => entry.id) : [],
    ).toEqual([itemId(2)])

    await controller.close('第一轮跑通', [
      { workItemId: itemId(2), expectedRevision: toRevision(2), moveTo: null },
    ])

    expect(controller.state().selected?.status).toBe(SPRINT_STATUS.closed)
    expect(itemsNow().find((entry) => entry.id === itemId(2))?.sprintId).toBeNull()
  })
})

describe('a conflict while moving a card', () => {
  it('leaves the board as it was and comes back consistent after a refresh', async () => {
    let moved = false
    const controller = createSprintController(
      stubClient({
        sprints: () => Promise.resolve([sprint(1, { status: SPRINT_STATUS.active })]),
        backlog: (query) =>
          Promise.resolve(
            query?.sprintId === null
              ? []
              : [
                  moved
                    ? item(1, { status: WORK_ITEM_STATUS.review })
                    : item(1, { status: WORK_ITEM_STATUS.todo }),
                ],
          ),
        moveWorkItemStatus: () => {
          // Somebody else moved it first, and to a different column.
          moved = true
          return Promise.reject(new ConflictError('SCR-1 has moved on', 1, 2))
        },
      }),
    )
    await controller.load()

    await controller.move(
      { workItemId: itemId(1), expectedRevision: toRevision(1) },
      WORK_ITEM_STATUS.done,
    )

    expect(controller.state().failure?.kind).toBe('conflict')
    const beforeRefresh = controller.state().board.columns.find((column) => column.cards.length > 0)
    expect(beforeRefresh?.status).toBe(WORK_ITEM_STATUS.todo)

    await controller.load()

    const afterRefresh = controller.state().board.columns.find((column) => column.cards.length > 0)
    expect(afterRefresh?.status).toBe(WORK_ITEM_STATUS.review)
    expect(controller.state().board.total.count).toBe(1)
  })
})

describe('creating a sprint and planning into it', () => {
  it('takes the dates the form gathered', async () => {
    const created: unknown[] = []
    const controller = createSprintController(
      stubClient({
        sprints: () => Promise.resolve([]),
        backlog: () => Promise.resolve([]),
        createSprint: (input) => {
          created.push(input)
          return Promise.resolve(sprint(1))
        },
      }),
    )
    await controller.load()

    await controller.create({
      name: '第一个 Sprint',
      goal: '打通结算',
      startDate: toTimestamp('2026-03-16T00:00:00.000Z'),
      endDate: toTimestamp('2026-03-30T00:00:00.000Z'),
    })

    expect(created).toHaveLength(1)
  })
})
