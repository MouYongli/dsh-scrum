// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterMultiSelect, createTranslate } from '@dsh-scrum/scrum-ui'
import { mount, type Mounted } from '../support/dom.js'

const t = createTranslate()
let open: Mounted | null = null

afterEach(() => {
  open?.unmount()
  open = null
})

const VALUES = ['epic', 'story', 'task'] as const
type Value = (typeof VALUES)[number]

const NAMES: Readonly<Record<Value, string>> = {
  epic: '史诗',
  story: '故事',
  task: '任务',
}

function control(selected: readonly Value[] = []): {
  mounted: Mounted
  onChange: (values: readonly Value[]) => void
} {
  const onChange = vi.fn()
  const mounted = mount(
    createElement(FilterMultiSelect<Value>, {
      id: 'scrum-test-type',
      name: 'type',
      label: '类型',
      values: VALUES,
      labelOf: (value: Value) => NAMES[value],
      selected,
      onChange,
      t,
    }),
  )
  open = mounted
  return { mounted, onChange }
}

describe('what the trigger says', () => {
  it('says everything is in when nothing is chosen', () => {
    const { mounted } = control()

    expect(mounted.find('[data-scrum-multi-summary]').textContent).toBe(t('filter.multi.any'))
  })

  it('names the values while naming stays shorter than counting', () => {
    const { mounted } = control(['epic', 'task'])

    expect(mounted.find('[data-scrum-multi-summary]').textContent).toBe('史诗 · 任务')
  })

  it('counts once the names stop fitting', () => {
    const { mounted } = control(['epic', 'story', 'task'])

    expect(mounted.find('[data-scrum-multi-summary]').textContent).toBe(
      `3 ${t('filter.multi.unit')}`,
    )
  })
})

describe('opening the panel', () => {
  it('stays shut until it is asked for, and reports which it is', () => {
    const { mounted } = control()
    const trigger = mounted.find('#scrum-test-type')

    expect(mounted.container.querySelector('[data-scrum-multi-panel]')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    mounted.click('#scrum-test-type')

    expect(mounted.container.querySelector('[data-scrum-multi-panel]')).not.toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('offers every value as a box, ticked to match the selection', () => {
    const { mounted } = control(['story'])

    mounted.click('#scrum-test-type')

    const boxes = mounted.all('[data-scrum-multi-value]') as readonly HTMLInputElement[]
    expect(boxes.map((box) => box.dataset.scrumMultiValue)).toEqual([...VALUES])
    expect(boxes.map((box) => box.checked)).toEqual([false, true, false])
  })
})

describe('leaving the panel', () => {
  it('closes on Escape and puts focus back on the trigger', () => {
    const { mounted } = control()
    mounted.click('#scrum-test-type')

    mounted.press('#scrum-test-type-epic', 'Escape')

    expect(mounted.container.querySelector('[data-scrum-multi-panel]')).toBeNull()
    expect(document.activeElement).toBe(mounted.find('#scrum-test-type'))
  })

  /*
   * The shell reads Escape as "leave the surface". A panel that closed and let
   * the key through would answer one Escape by closing the page behind it.
   */
  it('keeps its Escape to itself', () => {
    const { mounted } = control()
    const shell = vi.fn()
    document.addEventListener('keydown', shell)
    mounted.click('#scrum-test-type')

    mounted.press('#scrum-test-type-epic', 'Escape')

    expect(shell).not.toHaveBeenCalled()
    document.removeEventListener('keydown', shell)
  })

  it('closes when focus leaves it altogether', () => {
    const { mounted } = control()
    const elsewhere = document.createElement('button')
    document.body.appendChild(elsewhere)
    mounted.click('#scrum-test-type')

    mounted.leave('#scrum-test-type-epic', elsewhere)

    expect(mounted.container.querySelector('[data-scrum-multi-panel]')).toBeNull()
    elsewhere.remove()
  })

  it('stays open while focus moves between its own boxes', () => {
    const { mounted } = control()
    mounted.click('#scrum-test-type')

    mounted.leave('#scrum-test-type-epic', mounted.find('#scrum-test-type-story'))

    expect(mounted.container.querySelector('[data-scrum-multi-panel]')).not.toBeNull()
  })
})

describe('choosing', () => {
  it('adds a value in the dimension order rather than the click order', () => {
    const { mounted, onChange } = control(['task'])
    mounted.click('#scrum-test-type')

    mounted.toggle('#scrum-test-type-epic')

    expect(onChange).toHaveBeenCalledWith(['epic', 'task'])
  })

  it('drops a value that is ticked off', () => {
    const { mounted, onChange } = control(['epic', 'task'])
    mounted.click('#scrum-test-type')

    mounted.toggle('#scrum-test-type-epic')

    expect(onChange).toHaveBeenCalledWith(['task'])
  })
})
