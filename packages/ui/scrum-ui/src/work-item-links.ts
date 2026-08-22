import { createElement, useState, type ReactElement } from 'react'
import type { Rank, WorkItem, WorkItemId } from '@dsh-scrum/scrum-domain'
import { useDraftGuard } from './drafts.js'
import type { Translate } from './messages.js'

/**
 * Where an item lands when it is moved one place.
 *
 * The two neighbours it ends up between, which is what the store derives the
 * new rank from: one file is written and the rest of the list is left alone.
 * `null` at either end means there is no neighbour there, not rank zero.
 */
export interface RankTarget {
  readonly after: Rank | null
  readonly before: Rank | null
}

/**
 * Computed against the whole ordered backlog, not against the group the row is
 * drawn in. Rank is one order over the project; a move that only looked at the
 * visible group would place the item between two neighbours that have other
 * items between them, and the list would jump somewhere the user did not aim.
 */
export function rankTargetFor(
  ordered: readonly WorkItem[],
  id: WorkItemId,
  direction: 'up' | 'down',
): RankTarget | null {
  const index = ordered.findIndex((item) => item.id === id)
  if (index < 0) {
    return null
  }
  if (direction === 'up') {
    const before = ordered[index - 1]
    return before === undefined
      ? null
      : { after: ordered[index - 2]?.rank ?? null, before: before.rank }
  }
  const after = ordered[index + 1]
  return after === undefined
    ? null
    : { after: after.rank, before: ordered[index + 2]?.rank ?? null }
}

export interface OrderProps {
  readonly t: Translate
  readonly ordered: readonly WorkItem[]
  readonly id: WorkItemId
  readonly busy: boolean
  readonly onMove: (target: RankTarget) => void
}

/**
 * Two buttons rather than a drag handle.
 *
 * Dragging is not reachable from a keyboard, and reordering the backlog is not
 * an optional flourish — it is the product owner's main act. An item already
 * at an end has its button disabled rather than hidden, so the control does
 * not move around under the pointer as the list changes.
 */
export function OrderControls(props: OrderProps): ReactElement {
  function move(direction: 'up' | 'down'): void {
    const target = rankTargetFor(props.ordered, props.id, direction)
    if (target !== null) {
      props.onMove(target)
    }
  }
  return createElement(
    'span',
    { 'data-scrum-order': props.id },
    button(props, 'up', () => {
      move('up')
    }),
    button(props, 'down', () => {
      move('down')
    }),
  )
}

function button(props: OrderProps, direction: 'up' | 'down', onClick: () => void): ReactElement {
  return createElement(
    'button',
    {
      type: 'button',
      onClick,
      disabled: props.busy || rankTargetFor(props.ordered, props.id, direction) === null,
      'data-scrum-move': direction,
      'aria-label': props.t(direction === 'up' ? 'item.moveUp' : 'item.moveDown'),
    },
    props.t(direction === 'up' ? 'item.moveUp' : 'item.moveDown'),
  )
}

export interface ParentProps {
  readonly t: Translate
  readonly item: WorkItem
  readonly candidates: readonly WorkItem[]
  readonly busy: boolean
  readonly onChange: (parentId: WorkItemId | null) => void
}

/**
 * The parent, chosen from what is loaded.
 *
 * The item itself is not offered. Deeper cycles are left to the store: the
 * screen only ever has the page it read, so a check here would be a partial
 * one that reports differently depending on the filter, and the rule has to
 * hold for the agent's writes too.
 */
export function ParentPicker(props: ParentProps): ReactElement {
  const id = 'scrum-detail-parent'
  return createElement(
    'p',
    { 'data-scrum-parent': true },
    createElement('label', { htmlFor: id }, props.t('item.parent')),
    createElement(
      'select',
      {
        id,
        value: props.item.parentId ?? '',
        disabled: props.busy,
        onChange: (event: { target: { value: string } }) => {
          props.onChange(event.target.value === '' ? null : (event.target.value as WorkItemId))
        },
      },
      createElement('option', { key: '', value: '' }, props.t('item.noParent')),
      props.candidates
        .filter((candidate) => candidate.id !== props.item.id)
        .map((candidate) =>
          createElement(
            'option',
            { key: candidate.id, value: candidate.id },
            `${candidate.id} · ${candidate.title}`,
          ),
        ),
    ),
  )
}

export interface DependencyProps {
  readonly t: Translate
  readonly item: WorkItem
  readonly candidates: readonly WorkItem[]
  readonly busy: boolean
  readonly onChange: (dependsOnId: WorkItemId, linked: boolean) => void
}

/**
 * What this item waits on.
 *
 * A dependency on something outside the loaded page is still listed, by
 * identifier alone. The store tolerates a link to an item it cannot see — a
 * repository under repair always has some — and a panel that dropped those
 * from the list would be hiding exactly the ones worth looking at.
 */
export function DependencyPicker(props: DependencyProps): ReactElement {
  const [pending, setPending] = useState('')
  useDraftGuard(pending !== '')
  const titles = new Map(props.candidates.map((candidate) => [candidate.id, candidate.title]))
  const id = 'scrum-detail-dependency'
  return createElement(
    'section',
    { 'data-scrum-dependency-list': true },
    createElement('h4', null, props.t('backlog.dependencies')),
    props.item.dependsOn.length === 0
      ? createElement('p', null, props.t('item.noDependencies'))
      : createElement(
          'ul',
          null,
          props.item.dependsOn.map((dependency) =>
            createElement(
              'li',
              { key: dependency },
              `${dependency} · ${titles.get(dependency) ?? props.t('item.unknownItem')}`,
              createElement(
                'button',
                {
                  type: 'button',
                  disabled: props.busy,
                  'data-scrum-dependency-remove': dependency,
                  onClick: () => {
                    props.onChange(dependency, false)
                  },
                },
                props.t('item.removeDependency'),
              ),
            ),
          ),
        ),
    createElement('label', { htmlFor: id }, props.t('item.addDependency')),
    createElement(
      'select',
      {
        id,
        value: pending,
        disabled: props.busy,
        onChange: (event: { target: { value: string } }) => {
          setPending(event.target.value)
        },
      },
      createElement('option', { key: '', value: '' }, props.t('item.chooseItem')),
      props.candidates
        .filter(
          (candidate) =>
            candidate.id !== props.item.id && !props.item.dependsOn.includes(candidate.id),
        )
        .map((candidate) =>
          createElement(
            'option',
            { key: candidate.id, value: candidate.id },
            `${candidate.id} · ${candidate.title}`,
          ),
        ),
    ),
    createElement(
      'button',
      {
        type: 'button',
        disabled: props.busy || pending === '',
        'data-scrum-dependency-add': true,
        onClick: () => {
          if (pending !== '') {
            props.onChange(pending as WorkItemId, true)
            setPending('')
          }
        },
      },
      props.t('item.addDependency'),
    ),
  )
}

export interface BlockProps {
  readonly t: Translate
  readonly item: WorkItem
  readonly busy: boolean
  readonly onChange: (reason: string | null) => void
}

/**
 * Blocking is a reason or nothing at all.
 *
 * There is no checkbox beside a reason box, because the domain stores one
 * nullable reason: two controls that must agree are two controls that will
 * eventually disagree, and "blocked, reason unknown" is the state the product
 * design forbids.
 */
export function BlockControl(props: BlockProps): ReactElement {
  const [reason, setReason] = useState(props.item.blockedReason ?? '')
  // Against the item's own reason. An already blocked item opens with the box
  // full, and calling that unsaved would make leaving impossible to answer:
  // the question would come back however often it was dismissed.
  useDraftGuard(reason !== (props.item.blockedReason ?? ''))
  const id = 'scrum-detail-block'
  const blocked = props.item.blockedReason !== null
  return createElement(
    'p',
    { 'data-scrum-block': blocked },
    createElement('label', { htmlFor: id }, props.t('item.blockReason')),
    createElement('input', {
      id,
      value: reason,
      disabled: props.busy,
      onChange: (event: { target: { value: string } }) => {
        setReason(event.target.value)
      },
    }),
    createElement(
      'button',
      {
        type: 'button',
        disabled: props.busy || reason.trim() === '',
        'data-scrum-block-set': true,
        onClick: () => {
          props.onChange(reason.trim())
        },
      },
      props.t('item.block'),
    ),
    blocked
      ? createElement(
          'button',
          {
            type: 'button',
            disabled: props.busy,
            'data-scrum-block-clear': true,
            onClick: () => {
              setReason('')
              props.onChange(null)
            },
          },
          props.t('item.unblock'),
        )
      : null,
  )
}
