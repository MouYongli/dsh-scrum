import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PRIORITY, WORK_ITEM_RESOLUTION, WORK_ITEM_STATUS } from '@dsh-scrum/scrum-domain'
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
  it('keeps the decision columns visible and folds classification into identity', () => {
    const markup = render()

    for (const column of [
      LIST_COLUMN.title,
      LIST_COLUMN.status,
      LIST_COLUMN.priority,
      LIST_COLUMN.assignee,
      LIST_COLUMN.estimate,
      LIST_COLUMN.sprint,
      LIST_COLUMN.updated,
    ]) {
      expect(markup).toContain(`data-scrum-column="${column}"`)
    }
    expect(markup).toContain('data-scrum-item-key')
    expect(markup).toContain(t('type.story'))
    expect(markup).toContain(t('list.sortBy'))
  })

  it('surfaces risks and readiness without opening the detail', () => {
    const markup = render({
      state: state([
        item(1, {
          blockedReason: '等待接口',
          dependsOn: [item(2, {}).id],
          acceptanceCriteria: [
            { text: '可以退款', satisfied: true },
            { text: '记录原因', satisfied: false },
          ],
        }),
      ]),
    })

    expect(markup).toContain(t('list.signal.blocked'))
    expect(markup).toContain(`${t('list.signal.dependencies')} 1`)
    expect(markup).toContain(`${t('list.signal.criteria')} 1/2`)
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

    // The status carries the tone and the outcome trails it, so the two are
    // separate elements rather than one string.
    expect(markup).toContain(`<span data-scrum-badge="complete">${t('status.done')}</span>`)
    expect(markup).toContain(` · ${t('resolution.wontFix')}`)
  })

  it('does not answer "done" with the word done twice', () => {
    const markup = render({
      state: state([
        item(1, { status: WORK_ITEM_STATUS.done, resolution: WORK_ITEM_RESOLUTION.done }),
      ]),
    })

    // The outcome is the half of "done" that says whether the work was
    // delivered. Spelling both halves the same way spends a column saying
    // nothing.
    expect(t('resolution.done')).not.toBe(t('status.done'))
    expect(markup).toContain(` · ${t('resolution.done')}`)
  })

  it('tones the status and the priority, without dropping either word', () => {
    const markup = render({
      state: state([item(1, { status: WORK_ITEM_STATUS.inProgress, priority: PRIORITY.critical })]),
    })

    expect(markup).toContain(`<span data-scrum-badge="active">${t('status.inProgress')}</span>`)
    expect(markup).toContain(`<span data-scrum-badge="urgent">${t('priority.critical')}</span>`)
  })

  it('leaves the ordinary rows unmarked, so a mark still means something', () => {
    const markup = render({
      state: state([item(1, { status: WORK_ITEM_STATUS.todo, priority: PRIORITY.medium })]),
    })

    expect(markup).toContain(`<span data-scrum-badge="quiet">${t('status.todo')}</span>`)
    expect(markup).toContain(`<span data-scrum-badge="quiet">${t('priority.medium')}</span>`)
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
