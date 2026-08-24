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
      marked: [],
      outcome: null,
      sprints: [],
      readOnly: false,
      actions: {
        sort: vi.fn(),
        select: vi.fn(),
        refresh: vi.fn(),
        mark: vi.fn(),
        apply: vi.fn(),
        exportRows: vi.fn(),
      },
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

describe('selecting rows for a batch', () => {
  it('says how to start on the toolbar rather than holding a row open for it', () => {
    const markup = render()

    // The sentence is read once; a block that keeps saying it costs a row of
    // every screen after that, so it travels with the count instead.
    expect(markup).toContain(t('list.batch.hint'))
    expect(markup).not.toContain('data-scrum-batch=')
  })

  it('drops the hint once there is a selection to talk about instead', () => {
    const markup = render({ marked: [item(1, {}).id] })

    expect(markup).not.toContain(t('list.batch.hint'))
  })

  it('offers the change form once something is marked, and counts what is marked', () => {
    const markup = render({ marked: [item(1, {}).id] })

    expect(markup).toContain('data-scrum-batch="open"')
    expect(markup).toContain('data-scrum-batch-count="1"')
    expect(markup).toContain(t('list.batch.apply'))
  })

  it('offers neither selection nor export on an archived project', () => {
    const markup = render({ readOnly: true })

    expect(markup).not.toContain('data-scrum-mark-all')
    expect(markup).not.toContain('data-scrum-export')
    expect(markup).not.toContain('data-scrum-batch')
  })
})

describe('what the last batch did', () => {
  it('is not drawn before one has run', () => {
    expect(render()).not.toContain('data-scrum-batch-outcome')
  })

  it('reports both halves, because both happened', () => {
    // Eighteen of twenty written is not "the batch failed": each item carries
    // its own revision and was written on its own.
    const markup = render({
      outcome: {
        written: [item(1, {}).id],
        refused: [{ id: item(2, {}).id, failure: { kind: 'conflict', message: 'SCR-2 已被改动' } }],
      },
    })

    expect(markup).toContain('data-scrum-batch-written="1"')
    expect(markup).toContain('data-scrum-batch-refused="1"')
    expect(markup).toContain('data-scrum-batch-refusal="SCR-2"')
    expect(markup).toContain('SCR-2 已被改动')
  })
})
