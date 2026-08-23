import { createElement, type ReactElement } from 'react'
import type { WorkItemId, WorkItemResolution, WorkItemStatus } from '@dsh-scrum/scrum-domain'
import {
  BOARD_LANE,
  moveTargets,
  type BoardCard,
  type BoardColumn,
  type BoardLane,
  type BoardSwimlane,
  type BoardView,
} from './board.js'
import type { WorkItemRef } from './client.js'
import type { MessageKey, Translate } from './messages.js'
import { priorityLabel, statusLabel, typeLabel } from './vocabulary.js'

export interface BoardActions {
  readonly lane: (lane: BoardLane) => void
  readonly move: (
    item: WorkItemRef,
    status: WorkItemStatus,
    resolution: WorkItemResolution | null,
  ) => void
  readonly detail: (id: WorkItemId | null) => void
}

export interface BoardProps {
  readonly board: BoardView
  readonly lane: BoardLane
  readonly actions: BoardActions
  readonly t: Translate
  readonly busy: boolean
  readonly readOnly: boolean
}

const LANES: readonly { readonly value: BoardLane; readonly label: MessageKey }[] = [
  { value: BOARD_LANE.none, label: 'board.lane.none' },
  { value: BOARD_LANE.assignee, label: 'board.lane.assignee' },
  { value: BOARD_LANE.epic, label: 'board.lane.epic' },
]

export function Board(props: BoardProps): ReactElement {
  const { t } = props
  return createElement(
    'div',
    { 'data-scrum-board': true, 'aria-label': t('board.title') },
    createElement(
      'div',
      { 'data-scrum-board-bar': true },
      createElement('h3', null, t('board.title')),
      createElement('label', { htmlFor: 'scrum-board-lane' }, t('board.lane.label')),
      createElement(
        'select',
        {
          id: 'scrum-board-lane',
          value: props.lane,
          onChange: (event: { target: { value: string } }) => {
            props.actions.lane(event.target.value as BoardLane)
          },
        },
        LANES.map((entry) =>
          createElement('option', { key: entry.value, value: entry.value }, t(entry.label)),
        ),
      ),
    ),
    props.board.hidden === 0
      ? null
      : createElement(
          'p',
          { role: 'status', 'data-scrum-board-hidden': props.board.hidden },
          `${t('board.hidden')} ${props.board.hidden}`,
        ),
    props.board.lanes.map((lane) => laneSection(lane, props)),
  )
}

/**
 * One row of the board.
 *
 * An ungrouped board is one lane with no heading, so there is one shape to
 * draw rather than a grouped branch and an ungrouped one that can drift apart.
 */
function laneSection(lane: BoardSwimlane, props: BoardProps): ReactElement {
  const { t } = props
  return createElement(
    'section',
    { key: lane.key, 'data-scrum-lane': lane.key },
    lane.key === 'all'
      ? null
      : createElement(
          'h4',
          null,
          lane.label ??
            t(props.lane === BOARD_LANE.assignee ? 'board.lane.nobody' : 'board.lane.noEpic'),
        ),
    createElement(
      'div',
      { 'data-scrum-columns': true },
      lane.columns.map((column) => columnSection(column, props)),
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
      column.limit === null
        ? `${t('backlog.count')} ${column.totals.count} · ${t('backlog.estimate')} ${column.totals.estimate}`
        : `${t('backlog.count')} ${column.totals.count}/${column.limit} · ${t('backlog.estimate')} ${column.totals.estimate}`,
    ),
    // A warning rather than a refusal. A limit that blocked the move would be
    // one somebody works around by leaving the card where it is and doing the
    // work anyway, and then the board is lying about what is under way.
    column.overLimit
      ? createElement(
          'p',
          { role: 'status', 'data-scrum-over-limit': column.status },
          t('board.overLimit'),
        )
      : null,
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
