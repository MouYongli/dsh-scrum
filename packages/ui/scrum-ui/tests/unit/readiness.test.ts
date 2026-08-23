import { describe, expect, it } from 'vitest'
import { WORK_ITEM_TYPE } from '@dsh-scrum/scrum-domain'
import { READINESS_CHECK, readinessOf } from '@dsh-scrum/scrum-ui'
import { item } from '../support/items.js'

const READY = {
  description: '按天对账，差异可导出',
  estimate: 5,
  acceptanceCriteria: [{ text: '可以按天对账', satisfied: false }],
}

describe('whether an item is ready for a sprint', () => {
  it('passes only when every structural check does', () => {
    expect(readinessOf(item(1, READY))?.ready).toBe(true)
    expect(readinessOf(item(1, READY))?.missing).toEqual([])
  })

  it('names what is missing rather than only counting it', () => {
    const readiness = readinessOf(item(1))

    expect(readiness?.ready).toBe(false)
    expect(readiness?.missing).toEqual([
      READINESS_CHECK.described,
      READINESS_CHECK.estimated,
      READINESS_CHECK.accepted,
    ])
  })

  it('counts a blocked item as not ready however complete it is', () => {
    const readiness = readinessOf(item(1, { ...READY, blockedReason: '等待接口' }))

    expect(readiness?.missing).toEqual([READINESS_CHECK.unblocked])
  })

  it('treats a description of nothing but spaces as no description', () => {
    expect(readinessOf(item(1, { ...READY, description: '   ' }))?.missing).toEqual([
      READINESS_CHECK.described,
    ])
  })

  it('does not ask the question of a level a sprint cannot hold', () => {
    // An epic is never planned and a subtask rides on its parent, so a
    // readiness badge on either asks something nobody has to answer.
    expect(readinessOf(item(1, { type: WORK_ITEM_TYPE.epic }))).toBeNull()
    expect(readinessOf(item(2, { type: WORK_ITEM_TYPE.subtask }))).toBeNull()
  })
})
