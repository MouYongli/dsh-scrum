import { describe, expect, it, vi } from 'vitest'
import {
  ConflictError,
  SPRINT_STATUS,
  WORK_ITEM_STATUS,
  toRevision,
  toTimestamp,
} from '@dsh-scrum/scrum-domain'
import { createSprintController, defaultSprint } from '@dsh-scrum/scrum-ui'
import { stubClient } from '../support/client.js'
import { item, itemId, sprint, sprintId } from '../support/items.js'

const REVISION = toRevision(1)
const REF = { workItemId: itemId(1), expectedRevision: REVISION }

function client(sprints = [sprint(1)], planned = [item(1)], unplanned = [item(2)]) {
  return stubClient({
    sprints: () => Promise.resolve(sprints),
    backlog: (query) => Promise.resolve(query?.sprintId === null ? unplanned : planned),
  })
}

describe('which sprint the screen opens on', () => {
  it('opens on the active one, because that is the one being worked', () => {
    const sprints = [
      sprint(1, { status: SPRINT_STATUS.closed }),
      sprint(2, { status: SPRINT_STATUS.active }),
      sprint(3),
    ]

    expect(defaultSprint(sprints)?.id).toBe(sprintId(2))
  })

  it('falls back to the next planned one, which is what planning aims at', () => {
    expect(defaultSprint([sprint(1, { status: SPRINT_STATUS.closed }), sprint(2)])?.id).toBe(
      sprintId(2),
    )
  })

  it('has nothing to open on when there are no sprints', () => {
    expect(defaultSprint([])).toBeNull()
  })
})

describe('reading a sprint', () => {
  it('starts loading, before anything has been asked', () => {
    expect(createSprintController(client()).state().phase).toBe('loading')
  })

  it('reads the sprint work and the product backlog beside it', async () => {
    const queries: unknown[] = []
    const controller = createSprintController(
      stubClient({
        sprints: () => Promise.resolve([sprint(1)]),
        backlog: (query) => {
          queries.push(query)
          return Promise.resolve([])
        },
      }),
    )

    await controller.load()

    // Planning moves an item from one list to the other, so both are read.
    expect(queries).toEqual([{ sprintId: sprintId(1) }, { sprintId: null }])
  })

  it('projects the sprint work onto the board', async () => {
    const controller = createSprintController(
      client([sprint(1)], [item(1, { status: WORK_ITEM_STATUS.inProgress })]),
    )

    await controller.load()

    expect(controller.state().board.total.count).toBe(1)
    expect(controller.state().unplanned).toHaveLength(1)
  })

  it('blanks the screen when the read failed, and says so', async () => {
    const controller = createSprintController(
      stubClient({ sprints: () => Promise.reject(new Error('主机不可达')) }),
    )

    await controller.load()

    expect(controller.state().phase).toBe('failed')
    expect(controller.state().failure?.message).toBe('主机不可达')
  })

  it('keeps the chosen sprint across a reload rather than jumping back', async () => {
    const controller = createSprintController(client([sprint(1), sprint(2)]))
    await controller.load()

    await controller.select(sprintId(2))
    await controller.load()

    expect(controller.state().selected?.id).toBe(sprintId(2))
  })
})

describe('the drawer', () => {
  it('resolves the item from the board, and closes when it is no longer there', async () => {
    const boards = [[item(1)], []]
    const controller = createSprintController(
      stubClient({
        sprints: () => Promise.resolve([sprint(1)]),
        backlog: (query) => Promise.resolve(query?.sprintId === null ? [] : (boards.shift() ?? [])),
      }),
    )
    await controller.load()

    controller.openDetail(itemId(1))
    expect(controller.state().detail?.id).toBe(itemId(1))

    await controller.load()
    expect(controller.state().detail).toBeNull()
  })
})

describe('moving a card', () => {
  it('sends the status the user picked and reads the board back', async () => {
    const moves: unknown[] = []
    const backlog = vi.fn(() => Promise.resolve([item(1)]))
    const controller = createSprintController(
      stubClient({
        sprints: () => Promise.resolve([sprint(1)]),
        backlog,
        moveWorkItemStatus: (command) => {
          moves.push(command)
          return Promise.resolve(item(1))
        },
      }),
    )
    await controller.load()
    backlog.mockClear()

    await controller.move(REF, WORK_ITEM_STATUS.review)

    expect(moves).toEqual([{ ...REF, status: WORK_ITEM_STATUS.review }])
    expect(backlog).toHaveBeenCalledTimes(2)
  })

  it('reports a conflict and leaves the board as it was', async () => {
    const controller = createSprintController(
      stubClient({
        sprints: () => Promise.resolve([sprint(1)]),
        backlog: (query) =>
          Promise.resolve(query?.sprintId === null ? [] : [item(1, { status: 'todo' })]),
        moveWorkItemStatus: () => Promise.reject(new ConflictError('SCR-1 has moved on', 1, 2)),
      }),
    )
    await controller.load()

    await controller.move(REF, WORK_ITEM_STATUS.done)

    expect(controller.state().failure).toEqual({ kind: 'conflict', message: 'SCR-1 has moved on' })
    expect(controller.state().board.columns[0]?.cards).toHaveLength(1)
  })
})

describe('planning', () => {
  it('moves the named items into the selected sprint', async () => {
    const plans: unknown[] = []
    const controller = createSprintController(
      stubClient({
        sprints: () => Promise.resolve([sprint(1)]),
        backlog: () => Promise.resolve([]),
        planSprint: (command) => {
          plans.push(command)
          return Promise.resolve([])
        },
      }),
    )
    await controller.load()

    await controller.plan([REF], sprintId(1))

    expect(plans).toEqual([{ sprintId: sprintId(1), items: [REF] }])
  })
})

describe('the two confirmations', () => {
  it('asks before starting, and does nothing until the answer comes', async () => {
    const starts: unknown[] = []
    const controller = createSprintController(
      stubClient({
        sprints: () => Promise.resolve([sprint(1)]),
        backlog: () => Promise.resolve([]),
        startSprint: (command) => {
          starts.push(command)
          return Promise.resolve(sprint(1, { status: SPRINT_STATUS.active }))
        },
      }),
    )
    await controller.load()

    controller.ask('start')
    expect(controller.state().confirmation).toEqual({ kind: 'start', sprint: sprint(1) })
    expect(starts).toEqual([])

    await controller.start()
    expect(starts).toEqual([{ sprintId: sprintId(1), expectedRevision: REVISION }])
  })

  it('carries the unfinished items into the closing question', async () => {
    const controller = createSprintController(
      client(
        [sprint(1, { status: SPRINT_STATUS.active })],
        [item(1, { status: WORK_ITEM_STATUS.done }), item(2, { status: WORK_ITEM_STATUS.review })],
      ),
    )
    await controller.load()

    controller.ask('close')
    const confirmation = controller.state().confirmation

    expect(confirmation?.kind).toBe('close')
    expect(
      confirmation?.kind === 'close' ? confirmation.unfinished.map((entry) => entry.id) : [],
    ).toEqual([itemId(2)])
  })

  it('lets the user back out without writing anything', async () => {
    const controller = createSprintController(client())
    await controller.load()

    controller.ask('close')
    controller.cancel()

    expect(controller.state().confirmation).toBeNull()
  })

  it('takes the question down when the write starts', async () => {
    const controller = createSprintController(
      stubClient({
        sprints: () => Promise.resolve([sprint(1)]),
        backlog: () => Promise.resolve([]),
        startSprint: () => Promise.resolve(sprint(1, { status: SPRINT_STATUS.active })),
      }),
    )
    await controller.load()
    controller.ask('start')

    await controller.start()

    expect(controller.state().confirmation).toBeNull()
  })

  it('sends the summary and every disposition when closing', async () => {
    const closes: unknown[] = []
    const controller = createSprintController(
      stubClient({
        sprints: () => Promise.resolve([sprint(1, { status: SPRINT_STATUS.active })]),
        backlog: () => Promise.resolve([]),
        closeSprint: (command) => {
          closes.push(command)
          return Promise.resolve(sprint(1, { status: SPRINT_STATUS.closed }))
        },
      }),
    )
    await controller.load()

    await controller.close('按计划完成', [{ ...REF, moveTo: null }])

    expect(closes).toEqual([
      {
        sprintId: sprintId(1),
        expectedRevision: REVISION,
        resultSummary: '按计划完成',
        dispositions: [{ ...REF, moveTo: null }],
      },
    ])
  })

  it('reports a refused close rather than pretending the sprint shut', async () => {
    const controller = createSprintController(
      stubClient({
        sprints: () => Promise.resolve([sprint(1, { status: SPRINT_STATUS.active })]),
        backlog: () => Promise.resolve([]),
        closeSprint: () => Promise.reject(new ConflictError('the sprint has moved on', 1, 2)),
      }),
    )
    await controller.load()

    await controller.close('', [])

    expect(controller.state().failure?.kind).toBe('conflict')
  })
})

describe('creating a sprint', () => {
  it('selects the sprint it just created', async () => {
    const created = sprint(2)
    let sprints = [sprint(1)]
    const controller = createSprintController(
      stubClient({
        sprints: () => Promise.resolve(sprints),
        backlog: () => Promise.resolve([]),
        createSprint: () => {
          sprints = [sprint(1), created]
          return Promise.resolve(created)
        },
      }),
    )
    await controller.load()

    await controller.create({
      name: '第二个 Sprint',
      startDate: toTimestamp('2026-03-16T00:00:00.000Z'),
      endDate: toTimestamp('2026-03-30T00:00:00.000Z'),
    })

    expect(controller.state().selected?.id).toBe(sprintId(2))
  })
})
