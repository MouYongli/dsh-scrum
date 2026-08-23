import { createElement, type ReactElement } from 'react'
import type { WorkItemId, WorkItemResolution, WorkItemStatus } from '@dsh-scrum/scrum-domain'
import { moveTargets, type BoardCard, type BoardColumn, type BoardView } from './board.js'
import type { WorkItemRef } from './client.js'
import type { Translate } from './messages.js'
import { priorityLabel, statusLabel, typeLabel } from './vocabulary.js'

export interface BoardActions {
  readonly move: (
    item: WorkItemRef,
    status: WorkItemStatus,
    resolution: WorkItemResolution | null,
  ) => void
  readonly detail: (id: WorkItemId | null) => void
}

export interface BoardProps {
  readonly board: BoardView
  readonly actions: BoardActions
  readonly t: Translate
  readonly busy: boolean
  readonly readOnly: boolean
}

export function Board(props: BoardProps): ReactElement {
  const { t } = props
  return createElement(
    'div',
    { 'data-scrum-board': true, 'aria-label': t('board.title') },
    createElement('h3', null, t('board.title')),
    props.board.hidden === 0
      ? null
      : createElement(
          'p',
          { role: 'status', 'data-scrum-board-hidden': props.board.hidden },
          `${t('board.hidden')} ${props.board.hidden}`,
        ),
    createElement(
      'div',
      { 'data-scrum-columns': true },
      props.board.columns.map((column) => columnSection(column, props)),
    ),
  )
}

function columnSection(column: BoardColumn, props: BoardProps): ReactElement {
  const { t } = props
  return createElement(
    'section',
    { key: column.status, 'data-scrum-column': column.status },
    createElement('h4', null, t(statusLabel(column.status))),
    createElement(
      'p',
      { 'data-scrum-totals': true },
      `${t('backlog.count')} ${column.totals.count} · ${t('backlog.estimate')} ${column.totals.estimate}`,
    ),
    column.cards.length === 0
      ? createElement('p', null, t('board.column.empty'))
      : createElement(
          'ul',
          null,
          column.cards.map((card) => cardItem(card, props)),
        ),
  )
}

/**
 * One card.
 *
 * Moving is a labelled select, not a drag handle. Every interaction on this
 * board has to be reachable from a keyboard, and dragging is the one gesture
 * that never is; a select also names where the card can go, which a drag
 * target only reveals once the pointer is already over it.
 */
function cardItem(card: BoardCard, props: BoardProps): ReactElement {
  const { t } = props
  const item = card.item
  const id = `scrum-move-${item.id}`
  return createElement(
    'li',
    { key: item.id, 'data-scrum-card': item.id },
    createElement(
      'button',
      {
        type: 'button',
        onClick: () => {
          props.actions.detail(item.id)
        },
      },
      `${item.id} · ${item.title}`,
    ),
    createElement('span', { 'data-scrum-type': item.type }, t(typeLabel(item.type))),
    createElement(
      'span',
      { 'data-scrum-priority': item.priority },
      t(priorityLabel(item.priority)),
    ),
    createElement(
      'span',
      { 'data-scrum-estimate': true },
      item.estimate === null ? t('backlog.unestimated') : String(item.estimate),
    ),
    card.criteria.total === 0
      ? null
      : createElement(
          'span',
          { 'data-scrum-criteria': true },
          `${t('backlog.criteria')} ${card.criteria.satisfied}/${card.criteria.total}`,
        ),
    card.blocked
      ? createElement('span', { 'data-scrum-blocked': true }, t('backlog.blocked'))
      : null,
    props.readOnly
      ? null
      : createElement(
          'span',
          null,
          createElement('label', { htmlFor: id }, t('board.moveTo')),
          createElement(
            'select',
            {
              id,
              value: '',
              disabled: props.busy,
              'data-scrum-move': item.id,
              onChange: (event: { target: { value: string } }) => {
                const target = moveTargets(item.status).find(
                  (candidate) => candidate.key === event.target.value,
                )
                if (target !== undefined) {
                  props.actions.move(
                    { workItemId: item.id, expectedRevision: item.revision },
                    target.status,
                    target.resolution,
                  )
                }
              },
            },
            createElement('option', { key: '', value: '' }, t('board.moveTo')),
            moveTargets(item.status).map((target) =>
              createElement('option', { key: target.key, value: target.key }, t(target.label)),
            ),
          ),
        ),
  )
}
