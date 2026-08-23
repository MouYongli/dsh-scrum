import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SPRINT_STATUS, WORK_ITEM_RESOLUTION, WORK_ITEM_STATUS } from '@dsh-scrum/scrum-domain'
import { SprintScreen, boardView, createTranslate } from '@dsh-scrum/scrum-ui'
import type { SprintActions, SprintState } from '@dsh-scrum/scrum-ui'
import { item, sprint } from '../support/items.js'

const t = createTranslate()

const actions: SprintActions = {
  select: vi.fn(),
  create: vi.fn(),
  plan: vi.fn(),
  detail: vi.fn(),
  refresh: vi.fn(),
  dismiss: vi.fn(),
  lane: vi.fn(),
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

function state(overrides: Partial<SprintState> = {}): SprintState {
  return {
    phase: 'ready',
    sprints: [],
    selected: null,
    board: boardView([]),
    unplanned: [],
    detail: null,
    confirmation: null,
    lane: 'none',
    failure: null,
    busy: false,
    ...overrides,
  }
}

function render(overrides: Partial<SprintState> = {}, readOnly = false): string {
  return renderToStaticMarkup(
    createElement(SprintScreen, { state: state(overrides), actions, t, readOnly }),
  )
}

describe('the states a sprint screen can be in', () => {
  it('says it is reading, and shows no sprint yet', () => {
    const markup = render({ phase: 'loading' })

    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain(t('sprint.loading'))
    expect(markup).not.toContain('data-scrum-sprint-picker')
  })

  it('shows only the message when the read itself failed', () => {
    const markup = render({ phase: 'failed', failure: { kind: 'other', message: '主机不可达' } })

    expect(markup).toContain('主机不可达')
    expect(markup).not.toContain('data-scrum-planning')
  })

  it('offers creating the first sprint when there are none', () => {
    const markup = render()

    expect(markup).toContain('data-scrum-empty="no-sprints"')
    expect(markup).toContain(t('sprint.empty.title'))
    expect(markup).toContain('data-scrum-sprint-create-open')
  })

  it('offers no creation entry at all on an archived project', () => {
    expect(render({}, true)).not.toContain('data-scrum-sprint-create-open')
  })
})

describe('choosing a sprint', () => {
  it('shows every sprint with its status, not only the chosen one', () => {
    const sprints = [sprint(1, { status: SPRINT_STATUS.closed }), sprint(2)]
    const markup = render({ sprints, selected: sprints[1] ?? null })

    expect(markup).toContain(t('sprint.status.closed'))
    expect(markup).toContain(t('sprint.status.planned'))
    expect(markup).toContain('data-scrum-sprint="sprint-2"')
  })
})

describe('the sprint summary', () => {
  it('shows the dates the team agreed to, the goal and the progress', () => {
    const chosen = sprint(1, { goal: '打通结算' })
    const markup = render({
      sprints: [chosen],
      selected: chosen,
      board: boardView([
        item(1, { status: WORK_ITEM_STATUS.done, estimate: 5 }),
        item(2, { status: WORK_ITEM_STATUS.todo }),
      ]),
    })

    expect(markup).toContain('2026-03-01 — 2026-03-15')
    expect(markup).toContain('打通结算')
    expect(markup).toContain(`${t('sprint.progress.done')} 1/2`)
    expect(markup).toContain(`${t('backlog.estimate')} 5/5`)
    expect(markup).toContain(`${t('backlog.unestimated')} 1`)
  })

  it('leaves the goal line out rather than showing an empty one', () => {
    const chosen = sprint(1)

    expect(render({ sprints: [chosen], selected: chosen })).not.toContain('data-scrum-sprint-goal')
  })
})

describe('the planning panes', () => {
  it('shows the sprint work beside the product backlog', () => {
    const chosen = sprint(1)
    const markup = render({
      sprints: [chosen],
      selected: chosen,
      board: boardView([item(1, { status: WORK_ITEM_STATUS.todo })]),
      unplanned: [item(2)],
    })

    expect(markup).toContain('data-scrum-pane="scrum-planned"')
    expect(markup).toContain('data-scrum-pane="scrum-unplanned"')
    expect(markup).toContain('data-scrum-plan="sprint-1"')
    expect(markup).toContain('data-scrum-plan="backlog"')
  })

  it('says a pane is empty rather than showing an empty list', () => {
    const chosen = sprint(1)

    expect(render({ sprints: [chosen], selected: chosen })).toContain(t('sprint.pane.empty'))
  })

  it('takes no new work into a closed sprint, and says why', () => {
    const chosen = sprint(1, { status: SPRINT_STATUS.closed })
    const markup = render({ sprints: [chosen], selected: chosen, unplanned: [item(2)] })

    expect(markup).not.toContain('data-scrum-plan=')
    expect(markup).toContain(t('sprint.closedNotice'))
  })

  it('offers no planning at all on an archived project', () => {
    const chosen = sprint(1)
    const markup = render({ sprints: [chosen], selected: chosen, unplanned: [item(2)] }, true)

    expect(markup).not.toContain('data-scrum-plan=')
  })
})

describe('the board', () => {
  function board(...items: Parameters<typeof boardView>[0]): Partial<SprintState> {
    const chosen = sprint(1, { status: SPRINT_STATUS.active })
    return { sprints: [chosen], selected: chosen, board: boardView(items) }
  }

  it('draws every column with its heading and totals', () => {
    const markup = render(board(item(1, { status: WORK_ITEM_STATUS.todo, estimate: 3 })))

    expect(markup).toContain(`data-scrum-column="${WORK_ITEM_STATUS.todo}"`)
    expect(markup).toContain(`data-scrum-column="${WORK_ITEM_STATUS.done}"`)
    expect(markup).toContain(t('status.inProgress'))
    expect(markup).toContain(`${t('backlog.estimate')} 3`)
  })

  it('says a column is empty rather than leaving a blank space', () => {
    expect(render(board())).toContain(t('board.column.empty'))
  })

  it('moves a card through a labelled select, so a keyboard can do it', () => {
    const markup = render(board(item(1, { status: WORK_ITEM_STATUS.todo })))

    expect(markup).toContain('data-scrum-move="SCR-1"')
    expect(markup).toContain(`<label for="scrum-move-SCR-1">${t('board.moveTo')}</label>`)
    // Every other column is offered, not only the next one, and the last one
    // is offered once per way of ending rather than once.
    expect(markup).toContain(`value="${WORK_ITEM_STATUS.review}"`)
    expect(markup).toContain(`value="${WORK_ITEM_STATUS.done}:${WORK_ITEM_RESOLUTION.wontFix}"`)
    expect(markup).not.toContain(`value="${WORK_ITEM_STATUS.todo}"`)
  })

  it('offers no move control on an archived project', () => {
    expect(render(board(item(1, { status: WORK_ITEM_STATUS.todo })), true)).not.toContain(
      'data-scrum-move',
    )
  })

  it('reports work the board cannot show instead of losing it', () => {
    const markup = render(board(item(1, { status: WORK_ITEM_STATUS.backlog })))

    expect(markup).toContain('data-scrum-board-hidden="1"')
    expect(markup).toContain(t('board.hidden'))
  })

  it('opens the drawer on the same panel the backlog shows', () => {
    const chosen = sprint(1, { status: SPRINT_STATUS.active })
    const opened = item(1, { status: WORK_ITEM_STATUS.todo })
    const markup = render({
      sprints: [chosen],
      selected: chosen,
      board: boardView([opened]),
      detail: opened,
    })

    expect(markup).toContain('data-scrum-detail="SCR-1"')
    expect(markup).toContain('data-scrum-criteria-list')
  })
})

describe('starting and closing', () => {
  const active = sprint(1, { status: SPRINT_STATUS.active })

  it('offers only the transition the sprint status allows', () => {
    const planned = sprint(1)

    expect(render({ sprints: [planned], selected: planned })).toContain(
      'data-scrum-transition="start"',
    )
    expect(render({ sprints: [active], selected: active })).toContain(
      'data-scrum-transition="close"',
    )
    const closed = sprint(1, { status: SPRINT_STATUS.closed })
    expect(render({ sprints: [closed], selected: closed })).not.toContain('data-scrum-transition')
  })

  it('offers no transition at all on an archived project', () => {
    expect(render({ sprints: [active], selected: active }, true)).not.toContain(
      'data-scrum-transition',
    )
  })

  it('asks before starting, in a dialog that names the sprint', () => {
    const planned = sprint(1)
    const markup = render({
      sprints: [planned],
      selected: planned,
      confirmation: { kind: 'start', sprint: planned },
    })

    expect(markup).toContain('data-scrum-confirm="start"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain(planned.name)
    expect(markup).toContain(t('sprint.start.submit'))
  })

  it('asks where every unfinished item goes, with nothing preselected', () => {
    const markup = render({
      sprints: [active, sprint(2)],
      selected: active,
      confirmation: {
        kind: 'close',
        sprint: active,
        unfinished: [item(1, { title: '结算对账' })],
      },
    })

    expect(markup).toContain('data-scrum-unfinished="1"')
    expect(markup).toContain('data-scrum-disposition="SCR-1"')
    expect(markup).toContain(t('sprint.close.choose'))
    expect(markup).toContain(t('sprint.close.toBacklog'))
    // Nothing is decided yet, so closing is out of reach.
    expect(markup).toContain('disabled=""')
  })

  it('says so when there is nothing standing in the way', () => {
    const markup = render({
      sprints: [active],
      selected: active,
      confirmation: { kind: 'close', sprint: active, unfinished: [] },
    })

    expect(markup).toContain(t('sprint.close.allDone'))
    expect(markup).toContain(t('sprint.close.summary'))
  })
})

describe('reaching the board without a pointer', () => {
  const active = sprint(1, { status: SPRINT_STATUS.active })

  it('makes every interaction a button or a labelled control', () => {
    const markup = render({
      sprints: [active],
      selected: active,
      board: boardView([item(1, { status: WORK_ITEM_STATUS.todo })]),
      unplanned: [item(2)],
    })

    // Picking a sprint, opening a card, moving it, planning work and starting
    // or closing the sprint: no gesture among them, and every select labelled.
    for (const control of [
      'data-scrum-sprint="sprint-1"',
      'data-scrum-card="SCR-1"',
      'data-scrum-move="SCR-1"',
      'data-scrum-plan="sprint-1"',
      'data-scrum-transition="close"',
    ]) {
      expect(markup).toContain(control)
    }
    expect(markup).not.toContain('draggable')
    expect(markup).toContain('<label for="scrum-move-SCR-1">')
  })
})

describe('the limit and the lanes', () => {
  const active = sprint(1, { status: SPRINT_STATUS.active })

  function withBoard(board: SprintState['board'], lane: SprintState['lane'] = 'none'): string {
    return renderToStaticMarkup(
      createElement(SprintScreen, {
        state: state({ sprints: [active], selected: active, board, lane }),
        actions,
        t,
        readOnly: false,
      }),
    )
  }

  it('shows a count against the limit, and only where a limit applies', () => {
    const markup = withBoard(
      boardView([item(1, { status: WORK_ITEM_STATUS.inProgress })], { limit: 2 }),
    )

    expect(markup).toContain('1/2')
    expect(markup).not.toContain('data-scrum-over-limit')
  })

  it('warns rather than refusing when a column is over', () => {
    // A limit that blocked the move would be one somebody works around by
    // leaving the card where it is and doing the work anyway.
    const markup = withBoard(
      boardView(
        [
          item(1, { status: WORK_ITEM_STATUS.inProgress }),
          item(2, { status: WORK_ITEM_STATUS.inProgress }),
        ],
        { limit: 1 },
      ),
    )

    expect(markup).toContain(`data-scrum-over-limit="${WORK_ITEM_STATUS.inProgress}"`)
    expect(markup).toContain(t('board.overLimit'))
    // The move control is still there.
    expect(markup).toContain('data-scrum-move="SCR-1"')
  })

  it('draws one unheaded lane until somebody asks for swimlanes', () => {
    const markup = withBoard(boardView([item(1, { status: WORK_ITEM_STATUS.todo })]))

    expect(markup).toContain('data-scrum-lane="all"')
    expect(markup).toContain(t('board.lane.label'))
  })

  it('heads each swimlane, and names the one with no owner', () => {
    const markup = withBoard(
      boardView([item(1, { status: WORK_ITEM_STATUS.todo })], { lane: 'assignee' }),
      'assignee',
    )

    expect(markup).toContain('data-scrum-lane="none"')
    expect(markup).toContain(t('board.lane.nobody'))
  })
})
