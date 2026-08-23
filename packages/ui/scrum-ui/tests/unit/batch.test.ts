import { describe, expect, it, vi } from 'vitest'
import {
  ConflictError,
  PRIORITY,
  WORK_ITEM_RESOLUTION,
  WORK_ITEM_STATUS,
} from '@dsh-scrum/scrum-domain'
import { BATCH_FIELD, applyBatch } from '@dsh-scrum/scrum-ui'
import { stubClient } from '../support/client.js'
import { item, itemId, sprintId } from '../support/items.js'

const ITEMS = [item(1), item(2), item(3)]

describe('applying one change to several items', () => {
  it('writes each one on its own and reports what was written', async () => {
    const updateWorkItem = vi.fn(() => Promise.resolve(item(1)))
    const outcome = await applyBatch(stubClient({ updateWorkItem }), ITEMS, {
      field: BATCH_FIELD.priority,
      value: PRIORITY.critical,
    })

    expect(updateWorkItem).toHaveBeenCalledTimes(3)
    expect(outcome.written).toEqual([itemId(1), itemId(2), itemId(3)])
    expect(outcome.refused).toEqual([])
  })

  it('keeps going past a refusal and names the row that was refused', async () => {
    const updateWorkItem = vi.fn((command: { workItemId: string }) =>
      command.workItemId === itemId(2)
        ? Promise.reject(new ConflictError('SCR-2 has moved on', 1, 2, {}))
        : Promise.resolve(item(1)),
    )

    const outcome = await applyBatch(stubClient({ updateWorkItem }), ITEMS, {
      field: BATCH_FIELD.priority,
      value: PRIORITY.high,
    })

    // Not a transaction, and the panel must not claim otherwise: the first
    // item was already stored when the second was refused.
    expect(outcome.written).toEqual([itemId(1), itemId(3)])
    expect(outcome.refused.map((one) => one.id)).toEqual([itemId(2)])
    expect(outcome.refused[0]?.failure.kind).toBe('conflict')
  })

  it('carries the chosen ending when the move is to the last column', async () => {
    const moveWorkItemStatus = vi.fn(() => Promise.resolve(item(1)))

    await applyBatch(stubClient({ moveWorkItemStatus }), [item(1)], {
      field: BATCH_FIELD.status,
      value: `${WORK_ITEM_STATUS.done}:${WORK_ITEM_RESOLUTION.wontFix}`,
    })

    expect(moveWorkItemStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: WORK_ITEM_STATUS.done,
        resolution: WORK_ITEM_RESOLUTION.wontFix,
      }),
    )
  })

  it('sends no ending for a move that is not to the last column', async () => {
    const moveWorkItemStatus = vi.fn(() => Promise.resolve(item(1)))

    await applyBatch(stubClient({ moveWorkItemStatus }), [item(1)], {
      field: BATCH_FIELD.status,
      value: WORK_ITEM_STATUS.inProgress,
    })

    expect(moveWorkItemStatus).toHaveBeenCalledWith(
      expect.not.objectContaining({ resolution: expect.anything() }),
    )
  })

  it('adds a label without dropping the ones already there, and without repeating it', async () => {
    const updateWorkItem = vi.fn(() => Promise.resolve(item(1)))

    await applyBatch(stubClient({ updateWorkItem }), [item(1, { labels: ['支付'] })], {
      field: BATCH_FIELD.addLabel,
      value: '支付',
    })

    expect(updateWorkItem).toHaveBeenCalledWith(
      expect.objectContaining({ changes: { labels: ['支付'] } }),
    )
  })

  it('plans the whole selection in one call, because that is what the host does', async () => {
    const planSprint = vi.fn(() => Promise.resolve([]))

    const outcome = await applyBatch(stubClient({ planSprint }), ITEMS, {
      field: BATCH_FIELD.sprint,
      value: sprintId(1),
    })

    expect(planSprint).toHaveBeenCalledTimes(1)
    expect(outcome.written).toHaveLength(3)
  })

  it('refuses the whole selection when that one call is refused', async () => {
    const planSprint = vi.fn(() => Promise.reject(new ConflictError('moved on', 1, 2, {})))

    const outcome = await applyBatch(stubClient({ planSprint }), ITEMS, {
      field: BATCH_FIELD.sprint,
      value: '',
    })

    expect(outcome.written).toEqual([])
    expect(outcome.refused).toHaveLength(3)
  })
})
