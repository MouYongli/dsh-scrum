import {
  WORK_ITEM_STATUS,
  toWorkItemResolution,
  toWorkItemStatus,
  type Priority,
  type SprintId,
  type WorkItem,
  type WorkItemId,
} from '@dsh-scrum/scrum-domain'
import type { ScrumClient } from './client.js'
import { toFailure, type ScrumFailure } from './failure.js'

/**
 * What one batch change touches.
 *
 * Only fields whose new value is the same for every row. Titles and estimates
 * are absent because setting twenty items to one estimate is not an edit
 * anybody means to make.
 */
export const BATCH_FIELD = {
  status: 'status',
  priority: 'priority',
  assignee: 'assignee',
  sprint: 'sprint',
  addLabel: 'addLabel',
  removeLabel: 'removeLabel',
} as const

export type BatchField = (typeof BATCH_FIELD)[keyof typeof BATCH_FIELD]

/** The chosen value, spelled the way its control spells it. */
export interface BatchChange {
  readonly field: BatchField
  readonly value: string
}

export interface BatchRefusal {
  readonly id: WorkItemId
  readonly failure: ScrumFailure
}

/**
 * What a batch actually did.
 *
 * Both halves are reported because both happened. This is not a transaction —
 * each work item carries its own revision and is written on its own, and there
 * is no multi-entity write endpoint to make it one. When the third of twenty
 * is refused, the first two are already stored, and a panel that said "the
 * batch failed" would be describing a state the store is not in.
 */
export interface BatchOutcome {
  readonly written: readonly WorkItemId[]
  readonly refused: readonly BatchRefusal[]
}

/** `sprint-3` or the empty string, which is the product backlog. */
function sprintOf(value: string): SprintId | null {
  return value === '' ? null : (value as SprintId)
}

/**
 * Moving several items into one sprint is a single call, so it succeeds or is
 * refused as one. That is the endpoint's shape rather than a choice made here:
 * `planSprint` takes the whole list, and splitting it into one call per item
 * would be inventing a different operation than the one the host performs.
 */
async function plan(
  client: ScrumClient,
  items: readonly WorkItem[],
  value: string,
): Promise<BatchOutcome> {
  const refs = items.map((item) => ({ workItemId: item.id, expectedRevision: item.revision }))
  try {
    await client.planSprint({ sprintId: sprintOf(value), items: refs })
    return { written: items.map((item) => item.id), refused: [] }
  } catch (error: unknown) {
    const failure = toFailure(error)
    return { written: [], refused: items.map((item) => ({ id: item.id, failure })) }
  }
}

/**
 * The last column carries a way of ending, spelled `done:wont_fix` the way the
 * board spells it. Everything else is a plain status.
 */
function statusMove(value: string): { status: string; resolution: string | null } {
  const [status, resolution] = value.split(':')
  return { status: status ?? '', resolution: resolution ?? null }
}

async function applyToOne(client: ScrumClient, item: WorkItem, change: BatchChange): Promise<void> {
  const ref = { workItemId: item.id, expectedRevision: item.revision }
  switch (change.field) {
    case BATCH_FIELD.status: {
      const move = statusMove(change.value)
      await client.moveWorkItemStatus({
        ...ref,
        status: toWorkItemStatus(move.status),
        ...(move.resolution === null ? {} : { resolution: toWorkItemResolution(move.resolution) }),
      })
      return
    }
    case BATCH_FIELD.priority:
      await client.updateWorkItem({ ...ref, changes: { priority: change.value as Priority } })
      return
    case BATCH_FIELD.assignee:
      await client.updateWorkItem({
        ...ref,
        changes: { assigneeId: change.value === '' ? null : (change.value as never) },
      })
      return
    case BATCH_FIELD.addLabel:
      await client.updateWorkItem({
        ...ref,
        changes: { labels: [...new Set([...item.labels, change.value])] },
      })
      return
    case BATCH_FIELD.removeLabel:
      await client.updateWorkItem({
        ...ref,
        changes: { labels: item.labels.filter((label) => label !== change.value) },
      })
      return
    case BATCH_FIELD.sprint:
      // Handled in one call above; reaching here would mean the caller split
      // what the host performs as a whole.
      throw new Error('a sprint change is applied to the whole selection at once')
  }
}

/**
 * Applies one change to every selected item, in order, and keeps going.
 *
 * Sequential rather than concurrent: the writes go through one workspace
 * coordinator anyway, and twenty parallel calls would only make the order in
 * which they landed unpredictable — which matters to a reader trying to
 * understand a partial result.
 */
export async function applyBatch(
  client: ScrumClient,
  items: readonly WorkItem[],
  change: BatchChange,
): Promise<BatchOutcome> {
  if (change.field === BATCH_FIELD.sprint) {
    return await plan(client, items, change.value)
  }
  const written: WorkItemId[] = []
  const refused: BatchRefusal[] = []
  for (const item of items) {
    try {
      await applyToOne(client, item, change)
      written.push(item.id)
    } catch (error: unknown) {
      refused.push({ id: item.id, failure: toFailure(error) })
    }
  }
  return { written, refused }
}

/** Whether a status value names the last column, and so carries an ending. */
export function isFinishingMove(value: string): boolean {
  return statusMove(value).status === WORK_ITEM_STATUS.done
}
