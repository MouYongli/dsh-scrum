import { createElement, useRef, useState, type ReactElement } from 'react'
import type { Translate } from './messages.js'

export interface FilterMultiSelectProps<Value extends string> {
  /** The trigger's id, which is also the prefix for each option's. */
  readonly id: string
  /** The dimension, as a `data-scrum-multi` value and for the test hooks. */
  readonly name: string
  readonly label: string
  readonly values: readonly Value[]
  readonly labelOf: (value: Value) => string
  readonly selected: readonly Value[]
  readonly onChange: (values: readonly Value[]) => void
  readonly t: Translate
}

/**
 * One dimension with several values wanted at once, collapsed.
 *
 * The five multi-value filters were native `multiple` selects sized to three
 * rows. Three rows is not the number of options any of them has, so each one
 * clipped an option mid-glyph, grew its own scrollbar, and asked for a
 * modifier key to keep a second value -- while the epic and assignee filters
 * beside them were ordinary selects, so the bar read as two kinds of control
 * for one kind of job.
 *
 * A trigger that says what is chosen costs one row of bar height instead of
 * three and states the selection rather than making the user infer it from
 * what happens to be highlighted. The panel holds checkboxes, which is what
 * lets a second value be picked without a modifier -- the objection that
 * twenty-two checkboxes do not belong on a toolbar was right about the
 * toolbar, not about the checkboxes.
 */
export function FilterMultiSelect<Value extends string>(
  props: FilterMultiSelectProps<Value>,
): ReactElement {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const labelId = `${props.id}-label`
  const panelId = `${props.id}-panel`
  return createElement(
    'div',
    {
      'data-scrum-filter-field': true,
      'data-scrum-multi': props.name,
      /*
       * Escape closes this before it closes anything around it, and the focus
       * goes back to the trigger rather than to the top of the document. The
       * shell reads Escape as "leave the surface", so an unstopped one would
       * answer a closed panel by closing the page behind it.
       */
      onKeyDown: (event: { key: string; stopPropagation: () => void }) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
      },
      /*
       * Leaving by any route closes it: Tab past the last checkbox, or a click
       * somewhere else on the page. React's onBlur is focusout, so it reports
       * where focus went and the panel can tell "moved inside" from "left".
       */
      onBlur: (event: { currentTarget: HTMLElement; relatedTarget: Node | null }) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false)
        }
      },
    },
    createElement('span', { id: labelId, 'data-scrum-multi-label': true }, props.label),
    createElement(
      'button',
      {
        id: props.id,
        ref: trigger,
        type: 'button',
        'data-scrum-multi-trigger': props.name,
        'aria-expanded': open,
        'aria-controls': panelId,
        // The dimension names the control, the summary says its value.
        'aria-labelledby': `${labelId} ${props.id}`,
        onClick: () => {
          setOpen(!open)
        },
      },
      createElement('span', { 'data-scrum-multi-summary': true }, summary(props)),
    ),
    open ? panel(props, panelId, labelId) : null,
  )
}

/**
 * What is chosen, named while naming stays shorter than counting.
 *
 * Two labels are read faster than "2 selected" and say which two. Past that
 * the names stop fitting the trigger, and the count is the part that still
 * carries information.
 */
function summary<Value extends string>(props: FilterMultiSelectProps<Value>): string {
  const chosen = ordered(props)
  if (chosen.length === 0) {
    return props.t('filter.multi.any')
  }
  if (chosen.length <= 2) {
    return chosen.map(props.labelOf).join(' · ')
  }
  return `${chosen.length} ${props.t('filter.multi.unit')}`
}

function panel<Value extends string>(
  props: FilterMultiSelectProps<Value>,
  panelId: string,
  labelId: string,
): ReactElement {
  return createElement(
    'div',
    {
      id: panelId,
      'data-scrum-multi-panel': true,
      role: 'group',
      'aria-labelledby': labelId,
    },
    props.values.map((value) =>
      createElement(
        'label',
        { key: value, 'data-scrum-multi-option': true },
        createElement('input', {
          id: `${props.id}-${value}`,
          type: 'checkbox',
          'data-scrum-multi-value': value,
          checked: props.selected.includes(value),
          onChange: (event: { target: { checked: boolean } }) => {
            props.onChange(
              event.target.checked
                ? ordered({ ...props, selected: [...props.selected, value] })
                : props.selected.filter((one) => one !== value),
            )
          },
        }),
        createElement('span', null, props.labelOf(value)),
      ),
    ),
  )
}

/**
 * The selection in the dimension's own order rather than in click order, so
 * the same set of values is the same query however it was arrived at.
 */
function ordered<Value extends string>(props: FilterMultiSelectProps<Value>): readonly Value[] {
  return props.values.filter((value) => props.selected.includes(value))
}
