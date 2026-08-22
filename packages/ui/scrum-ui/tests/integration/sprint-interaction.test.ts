// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SPRINT_STATUS, WORK_ITEM_STATUS, toRevision, toTimestamp } from '@dsh-scrum/scrum-domain'
import { SprintScreen, boardView, createTranslate } from '@dsh-scrum/scrum-ui'
import type { SprintActions, SprintState } from '@dsh-scrum/scrum-ui'
import { mount, type Mounted } from '../support/dom.js'
import { item, itemId, sprint, sprintId } from '../support/items.js'

const t = createTranslate()
let open: Mounted | null = null

afterEach(() => {
  open?.unmount()
  open = null
})

function actions(): SprintActions {
  return {
    select: vi.fn(),
    create: vi.fn(),
    plan: vi.fn(),
    detail: vi.fn(),
    refresh: vi.fn(),
    dismiss: vi.fn(),
    move: vi.fn(),
    edit: vi.fn(),
    criterion: vi.fn(),
    parent: vi.fn(),
    dependency: vi.fn(),
    block: vi.fn(),
    ask: vi.fn(),
    cancel: vi.fn(),
    start: vi.fn(),
    close: vi.fn(),
  }
}

function screen(overrides: Partial<SprintState> = {}): {
  mounted: Mounted
  handlers: SprintActions
} {
  const handlers = actions()
  const state: SprintState = {
    phase: 'ready',
    sprints: [],
    selected: null,
    board: boardView([]),
    unplanned: [],
    detail: null,
    confirmation: null,
    failure: null,
    busy: false,
    ...overrides,
  }
  const mounted = mount(
    createElement(SprintScreen, { state, actions: handlers, t, readOnly: false }),
  )
  open = mounted
  return { mounted, handlers }
}

describe('choosing and creating a sprint', () => {
  it('selects the sprint that was pressed', () => {
    const first = sprint(1)
    const { mounted, handlers } = screen({ sprints: [first, sprint(2)], selected: first })

    mounted.click('[data-scrum-sprint="sprint-2"]')

    expect(handlers.select).toHaveBeenCalledWith(sprintId(2))
  })

  it('creates one from the dates the form gathered', () => {
    const { mounted, handlers } = screen()

    mounted.click('[data-scrum-sprint-create-open]')
    mounted.type('#scrum-sprint-name', '  第一个 Sprint ')
    mounted.type('#scrum-sprint-goal', '打通结算')
    mounted.type('#scrum-sprint-startDate', '2026-03-16')
    mounted.type('#scrum-sprint-endDate', '2026-03-30')
    mounted.submit('[data-scrum-sprint-form]')

    expect(handlers.create).toHaveBeenCalledWith({
      name: '第一个 Sprint',
      goal: '打通结算',
      startDate: toTimestamp('2026-03-16T00:00:00.000Z'),
      endDate: toTimestamp('2026-03-30T00:00:00.000Z'),
    })
  })
})

describe('planning', () => {
  it('moves one item into the sprint and one back out', () => {
    const chosen = sprint(1)
    const { mounted, handlers } = screen({
      sprints: [chosen],
      selected: chosen,
      board: boardView([item(1, { status: WORK_ITEM_STATUS.todo })]),
      unplanned: [item(2)],
    })

    mounted.click('[data-scrum-plan="sprint-1"]')
    expect(handlers.plan).toHaveBeenCalledWith(
      [{ workItemId: itemId(2), expectedRevision: toRevision(1) }],
      sprintId(1),
    )

    mounted.click('[data-scrum-plan="backlog"]')
    expect(handlers.plan).toHaveBeenCalledWith(
      [{ workItemId: itemId(1), expectedRevision: toRevision(1) }],
      null,
    )
  })
})

describe('the board', () => {
  const active = sprint(1, { status: SPRINT_STATUS.active })

  it('moves a card to the column that was chosen', () => {
    const { mounted, handlers } = screen({
      sprints: [active],
      selected: active,
      board: boardView([item(1, { status: WORK_ITEM_STATUS.todo })]),
    })

    mounted.choose('#scrum-move-SCR-1', WORK_ITEM_STATUS.review)

    expect(handlers.move).toHaveBeenCalledWith(
      { workItemId: itemId(1), expectedRevision: toRevision(1) },
      WORK_ITEM_STATUS.review,
    )
  })

  it('sends nothing when the placeholder is chosen again', () => {
    const { mounted, handlers } = screen({
      sprints: [active],
      selected: active,
      board: boardView([item(1, { status: WORK_ITEM_STATUS.todo })]),
    })

    mounted.choose('#scrum-move-SCR-1', '')

    expect(handlers.move).not.toHaveBeenCalled()
  })

  it('opens the drawer from a card and closes it from the drawer', () => {
    const card = item(1, { status: WORK_ITEM_STATUS.todo })
    const { mounted, handlers } = screen({
      sprints: [active],
      selected: active,
      board: boardView([card]),
      detail: card,
    })

    mounted.click('[data-scrum-card="SCR-1"] button')
    expect(handlers.detail).toHaveBeenCalledWith(itemId(1))

    mounted.click('[data-scrum-detail-close]')
    expect(handlers.detail).toHaveBeenCalledWith(null)
  })
})

describe('starting and closing', () => {
  const active = sprint(1, { status: SPRINT_STATUS.active })

  it('asks first, then starts', () => {
    const planned = sprint(1)
    const { mounted, handlers } = screen({ sprints: [planned], selected: planned })

    mounted.click('[data-scrum-transition="start"]')
    expect(handlers.ask).toHaveBeenCalledWith('start')
    expect(handlers.start).not.toHaveBeenCalled()

    open?.unmount()
    const asked = screen({
      sprints: [planned],
      selected: planned,
      confirmation: { kind: 'start', sprint: planned },
    })
    asked.mounted.click('[data-scrum-confirm-submit="start"]')

    expect(asked.handlers.start).toHaveBeenCalled()
  })

  it('backs out without writing anything', () => {
    const { mounted, handlers } = screen({
      sprints: [active],
      selected: active,
      confirmation: { kind: 'close', sprint: active, unfinished: [] },
    })

    mounted.click('[data-scrum-confirm-cancel]')

    expect(handlers.cancel).toHaveBeenCalled()
    expect(handlers.close).not.toHaveBeenCalled()
  })

  it('keeps closing out of reach until every unfinished item has a destination', () => {
    const leftover = item(2, { status: WORK_ITEM_STATUS.review })
    const { mounted, handlers } = screen({
      sprints: [active, sprint(2)],
      selected: active,
      confirmation: { kind: 'close', sprint: active, unfinished: [leftover] },
    })

    expect(
      (mounted.find('[data-scrum-confirm-submit="close"]') as HTMLButtonElement).disabled,
    ).toBe(true)

    mounted.type('#scrum-close-summary', '第一轮跑通')
    mounted.choose('#scrum-disposition-SCR-2', 'backlog')
    mounted.click('[data-scrum-confirm-submit="close"]')

    expect(handlers.close).toHaveBeenCalledWith('第一轮跑通', [
      { workItemId: itemId(2), expectedRevision: toRevision(1), moveTo: null },
    ])
  })

  it('carries an item into another sprint when that is what was chosen', () => {
    const leftover = item(2, { status: WORK_ITEM_STATUS.review })
    const { mounted, handlers } = screen({
      sprints: [active, sprint(2)],
      selected: active,
      confirmation: { kind: 'close', sprint: active, unfinished: [leftover] },
    })

    mounted.choose('#scrum-disposition-SCR-2', sprintId(2))
    mounted.click('[data-scrum-confirm-submit="close"]')

    expect(handlers.close).toHaveBeenCalledWith('', [
      { workItemId: itemId(2), expectedRevision: toRevision(1), moveTo: sprintId(2) },
    ])
  })
})

describe('the message above the screen', () => {
  it('refreshes on a conflict and dismisses on anything else', () => {
    const { mounted, handlers } = screen({
      failure: { kind: 'conflict', message: 'SCR-1 has moved on' },
    })

    mounted.click('[data-scrum-refresh]')
    expect(handlers.refresh).toHaveBeenCalled()

    mounted.click('[data-scrum-dismiss]')
    expect(handlers.dismiss).toHaveBeenCalled()
  })
})
