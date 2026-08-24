// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRIORITY, WORK_ITEM_TYPE, toIdentityId } from '@dsh-scrum/scrum-domain'
import { EMPTY_QUERY, FilterBar, createTranslate } from '@dsh-scrum/scrum-ui'
import type { WorkItemQuery } from '@dsh-scrum/scrum-ui'
import { mount, type Mounted } from '../support/dom.js'
import { item, itemId } from '../support/items.js'

const t = createTranslate()
let open: Mounted | null = null

afterEach(() => {
  open?.unmount()
  open = null
})

const ASSIGNEE = toIdentityId('idt_01ARZ3NDEKTSV4RRFFQ69G5FAX')

const ITEMS = [
  item(1, { type: WORK_ITEM_TYPE.epic, title: '结算' }),
  item(2, { parentId: itemId(1), labels: ['支付', '对账'] }),
  item(3, { priority: PRIORITY.critical }),
]

function bar(query: WorkItemQuery = EMPTY_QUERY): {
  mounted: Mounted
  onQuery: (query: WorkItemQuery) => void
} {
  const onQuery = vi.fn()
  const mounted = mount(
    createElement(FilterBar, { query, onQuery, items: ITEMS, t, id: 'scrum-test' }),
  )
  open = mounted
  return { mounted, onQuery }
}

function progressive(query: WorkItemQuery = EMPTY_QUERY): {
  mounted: Mounted
  onQuery: (query: WorkItemQuery) => void
  onUnestimated: (active: boolean) => void
} {
  const onQuery = vi.fn()
  const onUnestimated = vi.fn()
  const mounted = mount(
    createElement(FilterBar, {
      query,
      onQuery,
      items: ITEMS,
      t,
      id: 'scrum-progressive',
      progressive: true,
      unestimated: false,
      onUnestimated,
    }),
  )
  open = mounted
  return { mounted, onQuery, onUnestimated }
}

describe('setting a filter', () => {
  it('reports the text as it is typed', () => {
    const { mounted, onQuery } = bar()

    mounted.type('#scrum-test-text', '对账')

    expect(onQuery).toHaveBeenCalledWith({ ...EMPTY_QUERY, text: '对账' })
  })

  it('takes several types at once, and needs no modifier key for the second', () => {
    const { mounted, onQuery } = bar({ ...EMPTY_QUERY, types: [WORK_ITEM_TYPE.bug] })

    mounted.click('#scrum-test-type')
    mounted.toggle(`#scrum-test-type-${WORK_ITEM_TYPE.story}`)

    // Reported in the dimension's own order, not in the order they were
    // ticked, so one set of values is one query however it was arrived at.
    expect(onQuery).toHaveBeenCalledWith({
      ...EMPTY_QUERY,
      types: [WORK_ITEM_TYPE.story, WORK_ITEM_TYPE.bug],
    })
  })

  it('offers only the epics that were loaded', () => {
    const { mounted } = bar()
    const options = [...mounted.find('#scrum-test-epic').querySelectorAll('option')].map(
      (option) => option.value,
    )

    // A project's epics, plus "every epic". Offering one the project does not
    // have would be offering a filter that can only return nothing.
    expect(options).toEqual(['', itemId(1)])
  })

  it('separates unassigned work from the work of anybody at all', () => {
    const { mounted, onQuery } = bar()

    mounted.choose('#scrum-test-assignee', 'none')
    expect(onQuery).toHaveBeenCalledWith({ ...EMPTY_QUERY, assigneeId: null })

    mounted.choose('#scrum-test-assignee', '')
    expect(onQuery).toHaveBeenCalledWith({ ...EMPTY_QUERY, assigneeId: undefined })
  })

  it('clears the blocked field rather than setting it to false', () => {
    // Absent asks for everything; false asks for the items explicitly not
    // blocked, and those are different lists.
    const { mounted, onQuery } = bar({ ...EMPTY_QUERY, blocked: true })

    mounted.toggle('#scrum-test-blocked')

    expect(onQuery).toHaveBeenCalledWith({ ...EMPTY_QUERY, blocked: undefined })
  })

  it('offers labels only when the project uses any', () => {
    const { mounted } = bar()
    expect(mounted.container.querySelector('#scrum-test-labels')).not.toBeNull()

    const bare = mount(
      createElement(FilterBar, {
        query: EMPTY_QUERY,
        onQuery: vi.fn(),
        items: [item(1)],
        t,
        id: 'scrum-bare',
      }),
    )
    expect(bare.container.querySelector('#scrum-bare-labels')).toBeNull()
    bare.unmount()
  })
})

describe('clearing', () => {
  it('says nothing is narrowed rather than offering a clear that does nothing', () => {
    const { mounted } = bar()

    expect(mounted.container.querySelector('[data-scrum-filter-clear]')).toBeNull()
    expect(mounted.container.textContent).toContain(t('filter.none'))
  })

  it('drops every narrowing at once, and leaves nothing set', () => {
    const { mounted, onQuery } = bar({
      ...EMPTY_QUERY,
      text: '对账',
      types: [WORK_ITEM_TYPE.bug],
      assigneeId: ASSIGNEE,
      epicId: itemId(1),
      blocked: true,
    })

    mounted.click('[data-scrum-filter-clear]')

    expect(onQuery).toHaveBeenCalledWith(EMPTY_QUERY)
  })
})

describe('progressive filters', () => {
  it('keeps search compact and discloses the long tail', () => {
    const { mounted } = progressive()

    expect((mounted.find('[data-scrum-filter="text"]') as HTMLInputElement).placeholder).toBe(
      t('filter.text.placeholder'),
    )
    expect(mounted.container.querySelector('[data-scrum-quick-filter]')).toBeNull()
    expect(mounted.container.querySelector('[data-scrum-filter-advanced]')).toBeNull()
    expect(mounted.container.textContent).not.toContain(t('filter.none'))

    mounted.click('[data-scrum-filter-more]')

    expect(mounted.container.querySelector('[data-scrum-filter-advanced]')).not.toBeNull()
  })

  it('does not duplicate the summary filters inside the search bar', () => {
    const { mounted } = progressive()

    expect(mounted.container.querySelector('[data-scrum-quick-filter]')).toBeNull()
    expect(mounted.container.querySelector('[data-scrum-filter-more]')).not.toBeNull()
  })
})
