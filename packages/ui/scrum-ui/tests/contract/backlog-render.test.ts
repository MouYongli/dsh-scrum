import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PRIORITY, WORK_ITEM_TYPE } from '@dsh-scrum/scrum-domain'
import { BACKLOG_GROUPING, BacklogScreen, backlogPage, createTranslate } from '@dsh-scrum/scrum-ui'
import type { BacklogActions, BacklogState } from '@dsh-scrum/scrum-ui'
import { item, itemId } from '../support/items.js'

// Rendered to markup rather than asserted as an element tree: a tree assertion
// passes while the page shows nothing, because a component that returned the
// wrong branch still returned elements.

const t = createTranslate()

const actions: BacklogActions = {
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

function state(overrides: Partial<BacklogState> = {}): BacklogState {
  return {
    phase: 'ready',
    query: { sprintId: null },
    grouping: BACKLOG_GROUPING.none,
    page: backlogPage([], BACKLOG_GROUPING.none, false),
    ordered: [],
    selected: null,
    failure: null,
    busy: false,
    ...overrides,
  }
}

function render(overrides: Partial<BacklogState> = {}): string {
  return renderToStaticMarkup(
    createElement(BacklogScreen, { state: state(overrides), actions, t, readOnly: false }),
  )
}

function loaded(...items: Parameters<typeof backlogPage>[0]): Partial<BacklogState> {
  return { page: backlogPage(items, BACKLOG_GROUPING.none, false), ordered: items }
}

describe('the three states a backlog can be in', () => {
  it('says it is reading, and shows no list yet', () => {
    const markup = render({ phase: 'loading' })

    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain(t('backlog.loading'))
    expect(markup).not.toContain('data-scrum-list')
  })

  it('shows nothing but the message when the read itself failed', () => {
    const markup = render({ phase: 'failed', failure: { kind: 'other', message: '主机不可达' } })

    expect(markup).toContain('主机不可达')
    expect(markup).not.toContain('data-scrum-list')
    expect(markup).not.toContain('data-scrum-empty')
  })

  it('offers creating something when the project is empty', () => {
    const markup = render()

    expect(markup).toContain('data-scrum-empty="no-items"')
    expect(markup).toContain(t('backlog.empty.title'))
  })

  it('offers widening the filter when nothing matched', () => {
    const markup = render({ page: backlogPage([], BACKLOG_GROUPING.none, true) })

    expect(markup).toContain('data-scrum-empty="no-matches"')
    expect(markup).toContain(t('backlog.noMatches.title'))
  })
})

describe('one row', () => {
  it('shows the identifier, the title and the vocabulary in Chinese', () => {
    const markup = render(loaded(item(1, { title: '结算对账', type: WORK_ITEM_TYPE.bug })))

    expect(markup).toContain('data-scrum-row="SCR-1"')
    expect(markup).toContain('SCR-1 · 结算对账')
    expect(markup).toContain(t('type.bug'))
    expect(markup).toContain(t('priority.medium'))
  })

  it('opens from the keyboard, so it is a button and not a clickable box', () => {
    const markup = render(loaded(item(1)))

    expect(markup).toContain('<button type="button" aria-pressed="false"')
  })

  it('names an item nobody sized rather than showing an empty cell', () => {
    expect(render(loaded(item(1)))).toContain(t('backlog.unestimated'))
    expect(render(loaded(item(1, { estimate: 5 })))).toContain('data-scrum-estimate')
  })

  it('shows acceptance progress and dependencies only when there are any', () => {
    const bare = render(loaded(item(1)))

    expect(bare).not.toContain('data-scrum-criteria')
    expect(bare).not.toContain('data-scrum-dependencies')

    const rich = render(
      loaded(
        item(1, {
          acceptanceCriteria: [{ text: '可对账', satisfied: true }],
          dependsOn: [item(2).id],
        }),
      ),
    )

    expect(rich).toContain(`${t('backlog.criteria')} 1/1`)
    expect(rich).toContain(`${t('backlog.dependencies')} 1`)
  })

  it('marks a blocked item, because that is why it is not moving', () => {
    expect(render(loaded(item(1, { blockedReason: '等待接口' })))).toContain('data-scrum-blocked')
  })
})

describe('groups', () => {
  it('heads every group and totals it, including the unestimated count', () => {
    const markup = renderToStaticMarkup(
      createElement(BacklogScreen, {
        readOnly: false,
        state: state({
          grouping: BACKLOG_GROUPING.priority,
          page: backlogPage(
            [item(1, { priority: PRIORITY.critical, estimate: 3 }), item(2)],
            BACKLOG_GROUPING.priority,
            false,
          ),
        }),
        actions,
        t,
      }),
    )

    expect(markup).toContain(`data-scrum-group="${PRIORITY.critical}"`)
    expect(markup).toContain(t('priority.critical'))
    expect(markup).toContain(`${t('backlog.estimate')} 3`)
    expect(markup).toContain(`${t('backlog.unestimated')} 1`)
  })
})

describe('the message above the list', () => {
  it('offers a refresh for a conflict, and only for a conflict', () => {
    const conflict = render({
      ...loaded(item(1)),
      failure: { kind: 'conflict', message: 'SCR-1 has moved on' },
    })

    expect(conflict).toContain('data-scrum-failure="conflict"')
    expect(conflict).toContain(t('backlog.conflict.refresh'))
    expect(conflict).toContain(t('backlog.conflict.body'))
    // The list stays: a refused edit must not cost the user their place.
    expect(conflict).toContain('data-scrum-row="SCR-1"')

    const other = render({ failure: { kind: 'other', message: '写入失败' } })

    expect(other).not.toContain('data-scrum-refresh')
    expect(other).toContain('写入失败')
  })
})

describe('the toolbar', () => {
  it('binds every control to a label, so a screen reader announces it', () => {
    const markup = render()

    expect(markup).toContain(`<label for="scrum-backlog-text">${t('backlog.filter.text')}</label>`)
    expect(markup).toContain('id="scrum-backlog-grouping"')
    expect(markup).toContain(t('backlog.filter.blocked'))
    expect(markup).toContain(t('backlog.filter.planned'))
  })

  it('shows the sprint switch as off while the query is narrowed to the backlog', () => {
    expect(render()).toContain('id="scrum-backlog-planned" type="checkbox"')
    expect(render({ query: {} })).toContain('checked=""')
  })
})

describe('creating and inspecting a work item', () => {
  it('keeps the creation form folded away until it is asked for', () => {
    const markup = render()

    expect(markup).toContain('data-scrum-create-open')
    expect(markup).not.toContain('data-scrum-item-form="scrum-create"')
  })

  it('offers no creation entry at all on an archived project', () => {
    const markup = renderToStaticMarkup(
      createElement(BacklogScreen, { state: state(), actions, t, readOnly: true }),
    )

    expect(markup).not.toContain('data-scrum-create-open')
  })

  it('shows the selected item, its fields and its acceptance criteria', () => {
    const selected = item(1, {
      title: '结算对账',
      estimate: 5,
      labels: ['结算', '对账'],
      acceptanceCriteria: [
        { text: '可以按天对账', satisfied: true },
        { text: '差异可导出', satisfied: false },
      ],
    })
    const markup = render({ ...loaded(selected), selected })

    expect(markup).toContain('data-scrum-detail="SCR-1"')
    expect(markup).toContain('value="5"')
    expect(markup).toContain('value="结算, 对账"')
    expect(markup).toContain('可以按天对账')
    expect(markup).toContain(t('item.addCriterion'))
  })

  it('says so rather than showing an empty list when there are no criteria', () => {
    const selected = item(1)

    expect(render({ ...loaded(selected), selected })).toContain(t('item.noCriteria'))
  })

  it('offers no editing form on an archived project, but still shows the detail', () => {
    const selected = item(1, { acceptanceCriteria: [{ text: '可对账', satisfied: false }] })
    const markup = renderToStaticMarkup(
      createElement(BacklogScreen, {
        state: state({ ...loaded(selected), selected }),
        actions,
        t,
        readOnly: true,
      }),
    )

    expect(markup).toContain('data-scrum-detail="SCR-1"')
    expect(markup).not.toContain('data-scrum-item-form="scrum-detail"')
    expect(markup).toContain('disabled=""')
  })
})

describe('ordering, hierarchy, dependency and blocking', () => {
  it('offers keyboard reachable move controls on every row', () => {
    const markup = render(loaded(item(1), item(2)))

    expect(markup).toContain('data-scrum-move="up"')
    expect(markup).toContain('data-scrum-move="down"')
    expect(markup).toContain(`aria-label="${t('item.moveUp')}"`)
  })

  it('rests the control at the end of the list rather than hiding it', () => {
    const markup = render(loaded(item(1), item(2)))
    const first = markup.slice(markup.indexOf('data-scrum-order="SCR-1"'))

    expect(first.slice(0, first.indexOf('data-scrum-order="SCR-2"'))).toContain('disabled=""')
  })

  it('draws no move controls at all on an archived project', () => {
    const markup = renderToStaticMarkup(
      createElement(BacklogScreen, {
        state: state(loaded(item(1))),
        actions,
        t,
        readOnly: true,
      }),
    )

    expect(markup).not.toContain('data-scrum-order')
  })

  it('offers every loaded item as a parent except the item itself', () => {
    const selected = item(1)
    const markup = render({ ...loaded(selected, item(2)), selected })
    const picker = markup.slice(markup.indexOf('data-scrum-parent'))
    const options = picker.slice(0, picker.indexOf('</select>'))

    expect(options).toContain(t('item.noParent'))
    expect(options).toContain('SCR-2')
    expect(options).not.toContain('value="SCR-1"')
  })

  it('lists a dependency the current filter cannot see, by identifier', () => {
    const selected = item(1, { dependsOn: [itemId(9)] })
    const markup = render({ ...loaded(selected), selected })

    expect(markup).toContain(`SCR-9 · ${t('item.unknownItem')}`)
    expect(markup).toContain('data-scrum-dependency-remove="SCR-9"')
  })

  it('says there are none rather than showing an empty dependency list', () => {
    const selected = item(1)

    expect(render({ ...loaded(selected), selected })).toContain(t('item.noDependencies'))
  })

  it('offers one reason box, and a clear only once something is blocked', () => {
    const open = item(1)
    expect(render({ ...loaded(open), selected: open })).not.toContain('data-scrum-block-clear')

    const blocked = item(1, { blockedReason: '等待接口' })
    const markup = render({ ...loaded(blocked), selected: blocked })

    expect(markup).toContain('data-scrum-block="true"')
    expect(markup).toContain('value="等待接口"')
    expect(markup).toContain(t('item.unblock'))
  })
})
