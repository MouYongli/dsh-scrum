// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRIORITY, WORK_ITEM_STATUS } from '@dsh-scrum/scrum-domain'
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
    exportRows: vi.fn(),
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

describe('exporting', () => {
  it('hands over the rows the table is showing, not everything loaded', () => {
    const { mounted, actions } = list()

    mounted.click('[data-scrum-export]')

    expect(actions.exportRows).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: itemId(1) })]),
    )
  })
})
