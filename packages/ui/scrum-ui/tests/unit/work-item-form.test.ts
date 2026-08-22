import { describe, expect, it } from 'vitest'
import { PRIORITY, WORK_ITEM_TYPE } from '@dsh-scrum/scrum-domain'
import {
  EMPTY_FIELDS,
  fieldsOf,
  toDetailChanges,
  toEstimate,
  toLabels,
  toNewWorkItem,
} from '@dsh-scrum/scrum-ui'
import { item } from '../support/items.js'

describe('what the estimate box means', () => {
  it('reads an empty box as not sized, which is not sized at zero', () => {
    expect(toEstimate('')).toBeNull()
    expect(toEstimate('   ')).toBeNull()
    expect(toEstimate('0')).toBe(0)
  })

  it('accepts the fractions an hours-based project needs', () => {
    expect(toEstimate('1.5')).toBe(1.5)
  })

  it('does not guess at something that is not a number', () => {
    expect(toEstimate('大概三天')).toBeNull()
  })
})

describe('what the labels box means', () => {
  it('splits on commas and drops the spaces around them', () => {
    expect(toLabels(' 结算 , 对账 ')).toEqual(['结算', '对账'])
  })

  it('reads an empty box as no labels rather than one empty label', () => {
    expect(toLabels('')).toEqual([])
    expect(toLabels(' , ')).toEqual([])
  })
})

describe('what the form submits', () => {
  it('turns the fields into a creation command', () => {
    expect(toNewWorkItem({ ...EMPTY_FIELDS, title: '  结算对账  ' })).toEqual({
      type: WORK_ITEM_TYPE.story,
      title: '结算对账',
      description: '',
      priority: PRIORITY.medium,
      labels: [],
    })
  })

  it('sends every field it owns, so a cleared box clears the value', () => {
    expect(toDetailChanges({ ...EMPTY_FIELDS, title: '改名' })).toEqual({
      type: WORK_ITEM_TYPE.story,
      title: '改名',
      description: '',
      priority: PRIORITY.medium,
      estimate: null,
      labels: [],
    })
  })

  it('round-trips a stored item through the form and back unchanged', () => {
    const stored = item(1, {
      title: '结算',
      description: '按天对账',
      estimate: 3,
      labels: ['结算'],
      priority: PRIORITY.high,
      type: WORK_ITEM_TYPE.bug,
    })

    expect(toDetailChanges(fieldsOf(stored))).toEqual({
      type: WORK_ITEM_TYPE.bug,
      title: '结算',
      description: '按天对账',
      priority: PRIORITY.high,
      estimate: 3,
      labels: ['结算'],
    })
  })
})
