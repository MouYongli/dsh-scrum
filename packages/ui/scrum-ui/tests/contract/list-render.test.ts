import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { WORK_ITEM_RESOLUTION, WORK_ITEM_STATUS } from '@dsh-scrum/scrum-domain'
import {
  DEFAULT_SORT,
  LIST_COLUMN,
  WorkItemList,
  backlogPage,
  createTranslate,
  type ListProps,
} from '@dsh-scrum/scrum-ui'
import { item } from '../support/items.js'

const t = createTranslate()

function state(items: Parameters<typeof backlogPage>[0], filtered = false): ListProps['state'] {
  return {
    phase: 'ready',
    query: {},
    grouping: 'none',
    page: backlogPage(items, 'none', filtered),
    ordered: items,
    selected: null,
    failure: null,
    busy: false,
  }
}

function render(props: Partial<ListProps> = {}): string {
  return renderToStaticMarkup(
    createElement(WorkItemList, {
      state: state([item(1, {})]),
      sort: DEFAULT_SORT,
      t,
      actions: { sort: vi.fn(), select: vi.fn(), refresh: vi.fn() },
      ...props,
    }),
  )
}

describe('the work item list', () => {
  it('draws every column with a sortable heading', () => {
    const markup = render()

    for (const column of Object.values(LIST_COLUMN)) {
      if (column === LIST_COLUMN.rank) continue
      expect(markup).toContain(`data-scrum-column="${column}"`)
    }
    expect(markup).toContain(t('list.sortBy'))
  })

  it('says which column the table is ordered by', () => {
    // On the cell rather than inside the button, so a screen reader announces
    // it while reading the heading rather than only when the button is focused.
    const markup = render({ sort: { column: LIST_COLUMN.priority, direction: 'descending' } })

    expect(markup).toContain('aria-sort="descending"')
    expect(markup).toContain('aria-sort="none"')
  })

  it('shows how a finished item ended beside its status', () => {
    const markup = render({
      state: state([
        item(1, { status: WORK_ITEM_STATUS.done, resolution: WORK_ITEM_RESOLUTION.wontFix }),
      ]),
    })

    expect(markup).toContain(`${t('status.done')} · ${t('resolution.wontFix')}`)
  })

  it('names what is missing rather than leaving a cell blank', () => {
    const markup = render()

    expect(markup).toContain(t('list.unassigned'))
    expect(markup).toContain(t('list.noSprint'))
    expect(markup).toContain(t('backlog.unestimated'))
  })

  it('tells an empty project apart from an over-narrow filter', () => {
    expect(render({ state: state([], false) })).toContain(t('list.empty'))
    expect(render({ state: state([], true) })).toContain(t('list.noMatches'))
  })
})
