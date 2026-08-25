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
      },
      ...props,
    }),
  )
}

describe('the work item list', () => {
  it('keeps high-signal columns and removes globally empty columns', () => {
    const markup = render()

    for (const column of [LIST_COLUMN.title, LIST_COLUMN.status, LIST_COLUMN.updated]) {
      expect(markup).toContain(`data-scrum-column="${column}"`)
    }
    for (const column of [
      LIST_COLUMN.priority,
      LIST_COLUMN.assignee,
      LIST_COLUMN.estimate,
      LIST_COLUMN.sprint,
    ]) {
      expect(markup).not.toContain(`data-scrum-column="${column}"`)
    }
    expect(markup).toContain('data-scrum-item-key')
    expect(markup).toContain('data-scrum-type-icon="story"')
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
    expect(markup).not.toContain(t('list.signal.acceptanceWarning'))
  })

  it('says which column the table is ordered by', () => {
    // On the cell rather than inside the button, so a screen reader announces
    // it while reading the heading rather than only when the button is focused.
    const markup = render({ sort: { column: LIST_COLUMN.priority, direction: 'descending' } })

    expect(markup).toContain('aria-sort="descending"')
    expect(markup).toContain('aria-sort="none"')
  })

  it('shows a finished outcome as the single primary status', () => {
    const markup = render({
      state: state([
        item(1, { status: WORK_ITEM_STATUS.done, resolution: WORK_ITEM_RESOLUTION.wontFix }),
      ]),
    })

    expect(markup).toContain(`<span data-scrum-badge="quiet">${t('resolution.wontFix')}</span>`)
    expect(markup).not.toContain(t('status.done'))
  })

  it('does not answer "done" with the word done twice', () => {
    const markup = render({
      state: state([
        item(1, { status: WORK_ITEM_STATUS.done, resolution: WORK_ITEM_RESOLUTION.done }),
      ]),
    })

    expect(t('resolution.done')).not.toBe(t('status.done'))
    expect(markup).toContain(`<span data-scrum-badge="complete">${t('resolution.done')}</span>`)
    expect(markup).not.toContain(t('status.done'))
  })

  it('tones the status and the priority, without dropping either word', () => {
    const markup = render({
      state: state([item(1, { status: WORK_ITEM_STATUS.inProgress, priority: PRIORITY.critical })]),
    })

    expect(markup).toContain(`<span data-scrum-badge="active">${t('status.inProgress')}</span>`)
    expect(markup).toContain(`<span data-scrum-priority="urgent">${t('priority.critical')}</span>`)
  })

  it('leaves the ordinary rows unmarked, so a mark still means something', () => {
    const markup = render({
      state: state([item(1, { status: WORK_ITEM_STATUS.todo, priority: PRIORITY.medium })]),
    })

    expect(markup).toContain(`<span data-scrum-badge="quiet">${t('status.todo')}</span>`)
    expect(markup).not.toContain('data-scrum-column="priority"')
  })

  it('removes columns that contain no information', () => {
    const markup = render()

    expect(markup).not.toContain(`aria-label="${t('list.unassigned')}"`)
    expect(markup).not.toContain(`aria-label="${t('list.noSprint')}"`)
    expect(markup).not.toContain(`aria-label="${t('backlog.unestimated')}"`)
    expect(markup).not.toContain('data-scrum-empty-value="true"')
    expect(markup).toContain('dateTime="2026-03-01T09:00:00.000Z"')
  })

  it('tells an empty project apart from an over-narrow filter', () => {
    expect(render({ state: state([], false) })).toContain(t('list.empty'))
    expect(render({ state: state([], true) })).toContain(t('list.noMatches'))
  })
})

describe('selecting rows for a batch', () => {
  it('keeps batch instructions out of the page until a row is selected', () => {
    const markup = render()

    expect(markup).not.toContain(t('list.batch.hint'))
    expect(markup).not.toContain('data-scrum-batch=')
  })

  it('drops the hint once there is a selection to talk about instead', () => {
    const markup = render({ marked: [item(1, {}).id] })

    expect(markup).not.toContain(t('list.batch.hint'))
  })

  it('warns when a finished item still has unmet acceptance criteria', () => {
    const markup = render({
      state: state([
        item(1, {
          status: WORK_ITEM_STATUS.done,
          resolution: WORK_ITEM_RESOLUTION.done,
          acceptanceCriteria: [
            { text: 'first', satisfied: false },
            { text: 'second', satisfied: false },
          ],
        }),
      ]),
    })

    expect(markup).toContain('data-scrum-badge="attention"')
    expect(markup).toContain(t('list.status.acceptanceFailed'))
    expect(markup).not.toContain(t('status.done'))
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
