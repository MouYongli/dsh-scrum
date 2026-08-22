import { createElement, type ReactElement } from 'react'
import type { AcceptanceCriterion, WorkItem, WorkItemId } from '@dsh-scrum/scrum-domain'
import type { BlockWorkItem, DependWorkItem, EditWorkItem, SetCriterion } from './client.js'
import type { Translate } from './messages.js'
import type { ParentWorkItem } from './client.js'
import { AcceptanceCriteria, WorkItemForm, fieldsOf, toDetailChanges } from './work-item-form.js'
import { BlockControl, DependencyPicker, ParentPicker } from './work-item-links.js'

/** What a detail panel can ask for. Both screens that show one hand these in. */
export interface WorkItemDetailActions {
  readonly close: () => void
  readonly edit: (command: EditWorkItem) => void
  readonly criterion: (command: SetCriterion) => void
  readonly parent: (command: ParentWorkItem) => void
  readonly dependency: (command: DependWorkItem) => void
  readonly block: (command: BlockWorkItem) => void
}

export interface WorkItemDetailProps {
  readonly t: Translate
  readonly item: WorkItem
  /** The items a parent or a dependency can be picked from: what was loaded. */
  readonly candidates: readonly WorkItem[]
  readonly busy: boolean
  readonly readOnly: boolean
  readonly actions: WorkItemDetailActions
}

/**
 * One work item, in full.
 *
 * The same panel on the backlog and in the board's drawer. Two copies would
 * be two answers to what a work item is, and the second one is always the one
 * that stops getting the field the first one gained.
 *
 * The form and the blocking control are keyed by identifier and revision, so a
 * reload after somebody else's write rebuilds them from what is now stored
 * rather than leaving the user editing a version that no longer exists.
 */
export function WorkItemDetail(props: WorkItemDetailProps): ReactElement {
  const { item, t } = props
  const ref = { workItemId: item.id, expectedRevision: item.revision }
  const busy = props.busy || props.readOnly
  return createElement(
    'aside',
    { 'data-scrum-detail': item.id, 'aria-label': t('backlog.detail.title') },
    createElement('h3', null, `${item.id} · ${item.title}`),
    createElement(
      'button',
      { type: 'button', 'data-scrum-detail-close': true, onClick: props.actions.close },
      t('backlog.detail.close'),
    ),
    props.readOnly
      ? null
      : createElement(WorkItemForm, {
          key: `${item.id}:${item.revision}`,
          t,
          id: 'scrum-detail',
          initial: fieldsOf(item),
          submitLabel: 'item.save',
          busy: props.busy,
          onSubmit: (fields) => {
            props.actions.edit({ ...ref, changes: toDetailChanges(fields) })
          },
        }),
    createElement(AcceptanceCriteria, {
      t,
      criteria: item.acceptanceCriteria,
      busy,
      onToggle: (index: number, satisfied: boolean) => {
        props.actions.criterion({ ...ref, index, satisfied })
      },
      onChange: (criteria: readonly AcceptanceCriterion[]) => {
        props.actions.edit({ ...ref, changes: { acceptanceCriteria: criteria } })
      },
    }),
    createElement(ParentPicker, {
      t,
      item,
      candidates: props.candidates,
      busy,
      onChange: (parentId: WorkItemId | null) => {
        props.actions.parent({ ...ref, parentId })
      },
    }),
    createElement(DependencyPicker, {
      t,
      item,
      candidates: props.candidates,
      busy,
      onChange: (dependsOnId: WorkItemId, linked: boolean) => {
        props.actions.dependency({ ...ref, dependsOnId, linked })
      },
    }),
    createElement(BlockControl, {
      key: `${item.id}:${item.revision}`,
      t,
      item,
      busy,
      onChange: (reason: string | null) => {
        props.actions.block({ ...ref, reason })
      },
    }),
  )
}
