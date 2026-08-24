// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRIORITY, WORK_ITEM_STATUS, WORK_ITEM_TYPE } from '@dsh-scrum/scrum-domain'
import { DEFAULT_SORT, WorkItemList, backlogPage, createTranslate } from '@dsh-scrum/scrum-ui'
import type { ListProps } from '@dsh-scrum/scrum-ui'
import { mount, type Mounted } from '../support/dom.js'
import { item, itemId } from '../support/items.js'

const t = createTranslate()
let open: Mounted | null = null

afterEach(() => {
  open?.unmount()
  open = null
})

const ITEMS = [item(1), item(2)]

function list(props: Partial<ListProps> = {}): { mounted: Mounted; actions: ListProps['actions'] } {
  const actions: ListProps['actions'] = {
    sort: vi.fn(),
    select: vi.fn(),
    refresh: vi.fn(),
    mark: vi.fn(),
    apply: vi.fn(),
  }
  const mounted = mount(
    createElement(WorkItemList, {
      state: {
        phase: 'ready',
        query: {},
        grouping: 'none',
        page: backlogPage(ITEMS, 'none', false),
        ordered: ITEMS,
        selected: null,
        failure: null,
        busy: false,
      },
      sort: DEFAULT_SORT,
      marked: [],
      outcome: null,
      sprints: [],
      readOnly: false,
      t,
      actions,
      ...props,
    }),
  )
  open = mounted
  return { mounted, actions }
}

describe('marking rows', () => {
  it('adds one row to the selection and takes it back out', () => {
    const { mounted, actions } = list()
    mounted.toggle(`[data-scrum-mark="${itemId(1)}"]`)
    expect(actions.mark).toHaveBeenCalledWith([itemId(1)])

    open?.unmount()
    const marked = list({ marked: [itemId(1)] })
    marked.mounted.toggle(`[data-scrum-mark="${itemId(1)}"]`)
    expect(marked.actions.mark).toHaveBeenCalledWith([])
  })

  it('takes only the rows on screen when everything is selected', () => {
    // "All" has to mean what the user is looking at. A batch over rows the
    // filter is hiding is a batch nobody reviewed.
    const { mounted, actions } = list()

    mounted.toggle('[data-scrum-mark-all]')

    expect(actions.mark).toHaveBeenCalledWith([itemId(1), itemId(2)])
  })
})

describe('applying a change', () => {
  it('sends the field and the value the form was left on', () => {
    const { mounted, actions } = list({ marked: [itemId(1)] })

    mounted.choose('#scrum-batch-field', 'priority')
    mounted.choose('#scrum-batch-value-priority', PRIORITY.critical)
    mounted.submit('[data-scrum-batch="open"]')

    expect(actions.apply).toHaveBeenCalledWith({
      field: 'priority',
      value: PRIORITY.critical,
    })
  })

  it('sends a status and its ending as one value', () => {
    const { mounted, actions } = list({ marked: [itemId(1)] })

    mounted.choose('#scrum-batch-value-status', `${WORK_ITEM_STATUS.done}:wont_fix`)
    mounted.submit('[data-scrum-batch="open"]')

    expect(actions.apply).toHaveBeenCalledWith({
      field: 'status',
      value: `${WORK_ITEM_STATUS.done}:wont_fix`,
    })
  })
})

describe('the hierarchy', () => {
  it('shows one level by default and reveals grandchildren on demand', () => {
    const epic = item(1, { type: WORK_ITEM_TYPE.epic })
    const story = item(2, { type: WORK_ITEM_TYPE.story, parentId: epic.id })
    const subtask = item(3, { type: WORK_ITEM_TYPE.subtask, parentId: story.id })
    const hierarchy = [epic, story, subtask]
    const { mounted } = list({
      state: {
        phase: 'ready',
        query: {},
        grouping: 'none',
        page: backlogPage(hierarchy, 'none', false),
        ordered: hierarchy,
        selected: null,
        failure: null,
        busy: false,
      },
    })

    expect(mounted.container.querySelector(`[data-scrum-list-row="${subtask.id}"]`)).toBeNull()
    mounted.click(`[data-scrum-tree-toggle="${story.id}"]`)
    expect(mounted.find(`[data-scrum-list-row="${subtask.id}"]`).dataset.scrumDepth).toBe('2')
  })
})
