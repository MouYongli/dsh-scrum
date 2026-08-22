import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PRIORITY, WORK_ITEM_TYPE } from '@dsh-scrum/scrum-domain'
import { BACKLOG_GROUPING, BacklogScreen, backlogPage, createTranslate } from '@dsh-scrum/scrum-ui'
import type { BacklogActions, BacklogState } from '@dsh-scrum/scrum-ui'
import { item } from '../support/items.js'

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
}

function state(overrides: Partial<BacklogState> = {}): BacklogState {
  return {
    phase: 'ready',
    query: { planned: false },
    grouping: BACKLOG_GROUPING.none,
    page: backlogPage([], BACKLOG_GROUPING.none, false),
    selected: null,
    failure: null,
    busy: false,
    ...overrides,
  }
}

function render(overrides: Partial<BacklogState> = {}): string {
  return renderToStaticMarkup(createElement(BacklogScreen, { state: state(overrides), actions, t }))
}

function loaded(...items: Parameters<typeof backlogPage>[0]): Partial<BacklogState> {
  return { page: backlogPage(items, BACKLOG_GROUPING.none, false) }
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
