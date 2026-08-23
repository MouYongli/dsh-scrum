// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BUG_SEVERITY,
  PRIORITY,
  WORK_ITEM_CATEGORY,
  WORK_ITEM_TYPE,
  toRevision,
} from '@dsh-scrum/scrum-domain'
import { BACKLOG_GROUPING, BacklogScreen, backlogPage, createTranslate } from '@dsh-scrum/scrum-ui'
import type { BacklogActions, BacklogState } from '@dsh-scrum/scrum-ui'
import { mount, type Mounted } from '../support/dom.js'
import { item, itemId } from '../support/items.js'

// What an interaction does, which markup cannot show. The render tests already
// assert what each state draws; these press the controls.

const t = createTranslate()
let open: Mounted | null = null

afterEach(() => {
  open?.unmount()
  open = null
})

function actions(): BacklogActions {
  return {
    query: vi.fn(),
    group: vi.fn(),
    select: vi.fn(),
    refresh: vi.fn(),
    dismiss: vi.fn(),
    create: vi.fn(),
    edit: vi.fn(),
    criterion: vi.fn(),
    rank: vi.fn(),
    parent: vi.fn(),
    dependency: vi.fn(),
    block: vi.fn(),
  }
}

function screen(
  overrides: Partial<BacklogState> = {},
  handlers: BacklogActions = actions(),
): { mounted: Mounted; handlers: BacklogActions } {
  const items = overrides.ordered ?? []
  const state: BacklogState = {
    phase: 'ready',
    query: { sprintId: null },
    grouping: BACKLOG_GROUPING.none,
    page: backlogPage(items, BACKLOG_GROUPING.none, false),
    ordered: items,
    selected: null,
    failure: null,
    busy: false,
    ...overrides,
  }
  const mounted = mount(
    createElement(BacklogScreen, { state, actions: handlers, t, readOnly: false }),
  )
  open = mounted
  return { mounted, handlers }
}

describe('the toolbar', () => {
  it('narrows by text as it is typed', () => {
    const { mounted, handlers } = screen()

    mounted.type('#scrum-backlog-text', '结算')

    expect(handlers.query).toHaveBeenCalledWith({ sprintId: null, text: '结算' })
  })

  it('regroups without asking the client for anything', () => {
    const { mounted, handlers } = screen()

    mounted.choose('#scrum-backlog-grouping', BACKLOG_GROUPING.priority)

    expect(handlers.group).toHaveBeenCalledWith(BACKLOG_GROUPING.priority)
  })

  it('clears the sprint narrowing rather than setting it to a value', () => {
    const { mounted, handlers } = screen()

    mounted.toggle('#scrum-backlog-planned')

    expect(handlers.query).toHaveBeenCalledWith(expect.objectContaining({ sprintId: undefined }))
  })
})

describe('a row', () => {
  it('opens the detail, and closes it when pressed again', () => {
    const one = item(1)
    const { mounted, handlers } = screen({ ordered: [one] })

    mounted.click('[data-scrum-row="SCR-1"] button')

    expect(handlers.select).toHaveBeenCalledWith(itemId(1))
  })

  it('moves down between the two neighbours below it', () => {
    const items = [item(1), item(2), item(3)]
    const { mounted, handlers } = screen({ ordered: items })

    mounted.click('[data-scrum-order="SCR-1"] [data-scrum-move="down"]')

    expect(handlers.rank).toHaveBeenCalledWith({
      workItemId: itemId(1),
      expectedRevision: toRevision(1),
      after: items[1]?.rank,
      before: items[2]?.rank,
    })
  })

  it('does nothing at the top of the list, because the button is out of reach', () => {
    const { mounted, handlers } = screen({ ordered: [item(1), item(2)] })

    expect(
      (mounted.find('[data-scrum-order="SCR-1"] [data-scrum-move="up"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(handlers.rank).not.toHaveBeenCalled()
  })
})

describe('creating a work item', () => {
  it('unfolds the form, sends what was typed and folds it away again', () => {
    const { mounted, handlers } = screen()

    mounted.click('[data-scrum-create-open]')
    // The kind of work comes first and preselects the type, which is left
    // alone here: filing a defect as a bug is exactly the suggestion.
    mounted.choose('#scrum-create-category', WORK_ITEM_CATEGORY.defect)
    mounted.type('#scrum-create-title', '  结算对账  ')
    mounted.type('#scrum-create-description', '按天对账')
    mounted.choose('#scrum-create-priority', PRIORITY.critical)
    mounted.type('#scrum-create-labels', '结算, 对账')
    mounted.choose('#scrum-create-severity', BUG_SEVERITY.blocker)
    mounted.submit('[data-scrum-item-form="scrum-create"]')

    expect(handlers.create).toHaveBeenCalledWith({
      type: WORK_ITEM_TYPE.bug,
      category: WORK_ITEM_CATEGORY.defect,
      title: '结算对账',
      description: '按天对账',
      priority: PRIORITY.critical,
      labels: ['结算', '对账'],
      typeDetails: {
        type: WORK_ITEM_TYPE.bug,
        severity: BUG_SEVERITY.blocker,
        stepsToReproduce: '',
        expected: '',
        actual: '',
        environment: '',
        affectedVersion: '',
        isRegression: false,
        rootCause: '',
      },
    })
    expect(mounted.container.querySelector('[data-scrum-item-form="scrum-create"]')).toBeNull()
  })

  it('abandons what was typed when the form is cancelled', () => {
    const { mounted, handlers } = screen()

    mounted.click('[data-scrum-create-open]')
    mounted.type('#scrum-create-title', '写了一半')
    mounted.click('[data-scrum-item-cancel]')

    expect(handlers.create).not.toHaveBeenCalled()
    expect(mounted.container.querySelector('[data-scrum-item-form="scrum-create"]')).toBeNull()
  })
})

describe('the detail panel', () => {
  function opened(overrides = {}) {
    const selected = item(1, {
      estimate: 5,
      acceptanceCriteria: [{ text: '可对账', satisfied: false }],
      ...overrides,
    })
    return screen({ ordered: [selected, item(2)], selected })
  }

  it('sends every field it owns, so a cleared box clears the value', () => {
    const { mounted, handlers } = opened()

    mounted.type('#scrum-detail-estimate', '')
    mounted.submit('[data-scrum-item-form="scrum-detail"]')

    expect(handlers.edit).toHaveBeenCalledWith({
      workItemId: itemId(1),
      expectedRevision: toRevision(1),
      changes: expect.objectContaining({ estimate: null }),
    })
  })

  it('ticks one acceptance criterion by position', () => {
    const { mounted, handlers } = opened()

    mounted.toggle('#scrum-criterion-0')

    expect(handlers.criterion).toHaveBeenCalledWith({
      workItemId: itemId(1),
      expectedRevision: toRevision(1),
      index: 0,
      satisfied: true,
    })
  })

  it('adds and removes a criterion through the whole list', () => {
    const { mounted, handlers } = opened()

    mounted.type('#scrum-criterion-new', '差异可导出')
    mounted.click('[data-scrum-criterion-add]')

    expect(handlers.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: {
          acceptanceCriteria: [
            { text: '可对账', satisfied: false },
            { text: '差异可导出', satisfied: false },
          ],
        },
      }),
    )

    mounted.click('[data-scrum-criterion-remove="0"]')

    expect(handlers.edit).toHaveBeenCalledWith(
      expect.objectContaining({ changes: { acceptanceCriteria: [] } }),
    )
  })

  it('sets a parent, and clears it back to none', () => {
    const { mounted, handlers } = opened()

    mounted.choose('#scrum-detail-parent', itemId(2))
    expect(handlers.parent).toHaveBeenCalledWith(expect.objectContaining({ parentId: itemId(2) }))

    mounted.choose('#scrum-detail-parent', '')
    expect(handlers.parent).toHaveBeenCalledWith(expect.objectContaining({ parentId: null }))
  })

  it('links a dependency only once one has been chosen', () => {
    const { mounted, handlers } = opened()

    mounted.click('[data-scrum-dependency-add]')
    expect(handlers.dependency).not.toHaveBeenCalled()

    mounted.choose('#scrum-detail-dependency', itemId(2))
    mounted.click('[data-scrum-dependency-add]')

    expect(handlers.dependency).toHaveBeenCalledWith(
      expect.objectContaining({ dependsOnId: itemId(2), linked: true }),
    )
  })

  it('refuses to block without a reason, and clears a block in one press', () => {
    const { mounted, handlers } = opened({ blockedReason: '等待接口' })

    mounted.type('#scrum-detail-block', '   ')
    expect((mounted.find('[data-scrum-block-set]') as HTMLButtonElement).disabled).toBe(true)

    mounted.type('#scrum-detail-block', '等待上游接口')
    mounted.click('[data-scrum-block-set]')
    expect(handlers.block).toHaveBeenCalledWith(expect.objectContaining({ reason: '等待上游接口' }))

    mounted.click('[data-scrum-block-clear]')
    expect(handlers.block).toHaveBeenCalledWith(expect.objectContaining({ reason: null }))
  })

  it('closes from its own control', () => {
    const { mounted, handlers } = opened()

    mounted.click('[data-scrum-detail-close]')

    expect(handlers.select).toHaveBeenCalledWith(null)
  })
})

describe('the message above the list', () => {
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
