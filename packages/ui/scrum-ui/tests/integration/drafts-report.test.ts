// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AcceptanceCriteria,
  BlockControl,
  DependencyPicker,
  DraftsProvider,
  EMPTY_FIELDS,
  SprintConfirmDialog,
  SprintForm,
  Workbench,
  WorkItemForm,
  createDraftRegistry,
  createTranslate,
  fieldsOf,
} from '@dsh-scrum/scrum-ui'
import type { DraftRegistry } from '@dsh-scrum/scrum-ui'
import { mount, type Mounted } from '../support/dom.js'
import { item, sprint } from '../support/items.js'

// What each form reports about itself. The rule every case here is checking is
// that "unsaved" means changed from what the form opened with — a form seeded
// from an existing item starts full and has nothing unsaved in it.

const t = createTranslate()
let open: Mounted | null = null

afterEach(() => {
  open?.unmount()
  open = null
})

function held(element: ReactElement): { readonly form: Mounted; readonly drafts: DraftRegistry } {
  const drafts = createDraftRegistry()
  open = mount(createElement(DraftsProvider, { registry: drafts }, element))
  return { form: open, drafts }
}

describe('the work item form', () => {
  it('reports nothing while it still shows what it opened with', () => {
    const { drafts } = held(
      createElement(WorkItemForm, {
        t,
        id: 'scrum-create',
        initial: fieldsOf(item(1, { title: 'Coupon settlement' })),
        submitLabel: 'item.create',
        busy: false,
        onSubmit: () => undefined,
      }),
    )

    // The detail form opens full. Calling that unsaved would make the question
    // unanswerable: it would never stop being true.
    expect(drafts.held()).toBe(false)
  })

  it('reports a draft once a field moves off its opening value', () => {
    const { form, drafts } = held(
      createElement(WorkItemForm, {
        t,
        id: 'scrum-create',
        initial: EMPTY_FIELDS,
        submitLabel: 'item.create',
        busy: false,
        onSubmit: () => undefined,
      }),
    )

    form.type('#scrum-create-title', 'Coupon settlement')

    expect(drafts.held()).toBe(true)
  })
})

describe('the acceptance criteria box', () => {
  it('reports only what has been typed into the new-criterion field', () => {
    const { form, drafts } = held(
      createElement(AcceptanceCriteria, {
        t,
        criteria: [{ text: 'A coupon applies once', satisfied: false }],
        busy: false,
        onToggle: () => undefined,
        onChange: () => undefined,
      }),
    )
    expect(drafts.held()).toBe(false)

    form.type('#scrum-criterion-new', 'An expired coupon is refused')

    expect(drafts.held()).toBe(true)
  })
})

describe('the sprint form', () => {
  it('reports nothing until something is entered', () => {
    const { form, drafts } = held(
      createElement(SprintForm, {
        t,
        busy: false,
        onSubmit: () => undefined,
        onCancel: () => undefined,
      }),
    )
    expect(drafts.held()).toBe(false)

    form.type('#scrum-sprint-name', 'Sprint 12')

    expect(drafts.held()).toBe(true)
  })
})

describe('the block control', () => {
  it('reports nothing for an item that is already blocked', () => {
    const { drafts } = held(
      createElement(BlockControl, {
        t,
        item: item(1, { blockedReason: 'waiting on payments' }),
        busy: false,
        onChange: () => undefined,
      }),
    )

    // The regression this guards: a box seeded from the item's own reason is
    // not unsaved work, and treating it as such made leaving impossible.
    expect(drafts.held()).toBe(false)
  })

  it('reports a draft when the reason is edited', () => {
    const { form, drafts } = held(
      createElement(BlockControl, {
        t,
        item: item(1, { blockedReason: 'waiting on payments' }),
        busy: false,
        onChange: () => undefined,
      }),
    )

    form.type('#scrum-detail-block', 'waiting on the refund service')

    expect(drafts.held()).toBe(true)
  })
})

describe('the dependency picker', () => {
  it('reports only a dependency that has been chosen and not yet linked', () => {
    const { form, drafts } = held(
      createElement(DependencyPicker, {
        t,
        item: item(1),
        candidates: [item(2, { title: 'Refund service' })],
        busy: false,
        onChange: () => undefined,
      }),
    )
    expect(drafts.held()).toBe(false)

    form.choose('#scrum-detail-dependency', 'SCR-2')

    expect(drafts.held()).toBe(true)
  })
})

describe('the project wizard', () => {
  it('reports nothing until the workspace is being given a project', () => {
    const { form, drafts } = held(
      createElement(Workbench, {
        t,
        state: {
          kind: 'ready',
          creating: false,
          failure: null,
          entry: { state: 'unbound', workspace: { id: 'ws-1', name: 'shop-service' } },
        },
      }),
    )
    expect(drafts.held()).toBe(false)

    form.type('#scrum-name', '优惠券结算')

    expect(drafts.held()).toBe(true)
  })
})

describe('the sprint close question', () => {
  it('reports the summary the user has started writing', () => {
    const closing = sprint(1, { name: 'Sprint 12' })
    const { form, drafts } = held(
      createElement(SprintConfirmDialog, {
        t,
        confirmation: { kind: 'close', sprint: closing, unfinished: [] },
        sprints: [closing],
        busy: false,
        onCancel: () => undefined,
        onStart: () => undefined,
        onClose: () => undefined,
      }),
    )
    expect(drafts.held()).toBe(false)

    form.type('#scrum-close-summary', '优惠券结算已上线')

    expect(drafts.held()).toBe(true)
  })
})
