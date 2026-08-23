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
      category: null,
      title: '结算对账',
      description: '',
      priority: PRIORITY.medium,
      labels: [],
      // A story carries no fields of its own, so only the tag goes with it.
      typeDetails: { type: WORK_ITEM_TYPE.story },
    })
  })

  it('sends every field it owns, so a cleared box clears the value', () => {
    expect(toDetailChanges({ ...EMPTY_FIELDS, title: '改名' })).toEqual({
      type: WORK_ITEM_TYPE.story,
      category: null,
      title: '改名',
      description: '',
      priority: PRIORITY.medium,
      estimate: null,
      labels: [],
      typeDetails: { type: WORK_ITEM_TYPE.story },
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
      category: null,
      title: '结算',
      description: '按天对账',
      priority: PRIORITY.high,
      estimate: 3,
      labels: ['结算'],
      typeDetails: {
        type: WORK_ITEM_TYPE.bug,
        severity: null,
        stepsToReproduce: '',
        expected: '',
        actual: '',
        environment: '',
        affectedVersion: '',
        isRegression: false,
        rootCause: '',
      },
    })
  })

  it('carries the fields a bug has, and forgets them when the type moves', () => {
    const filed = {
      ...EMPTY_FIELDS,
      type: WORK_ITEM_TYPE.bug,
      title: '白屏',
      details: { severity: 'blocker', isRegression: 'yes', stepsToReproduce: ' 打开设置 ' },
    }

    expect(toNewWorkItem(filed).typeDetails).toMatchObject({
      type: WORK_ITEM_TYPE.bug,
      severity: 'blocker',
      isRegression: true,
      stepsToReproduce: '打开设置',
    })
    // A story has none of those fields, so nothing of the bug survives the
    // change; the domain would refuse a payload tagged for the wrong type.
    expect(toNewWorkItem({ ...filed, type: WORK_ITEM_TYPE.story }).typeDetails).toEqual({
      type: WORK_ITEM_TYPE.story,
    })
  })

  it('stops sending an estimate for a type that cannot carry one', () => {
    const sized = { ...EMPTY_FIELDS, title: '史诗', estimate: '5' }

    expect(toDetailChanges(sized).estimate).toBe(5)
    expect(toDetailChanges({ ...sized, type: WORK_ITEM_TYPE.epic }).estimate).toBeNull()
    expect(toDetailChanges({ ...sized, type: WORK_ITEM_TYPE.subtask }).estimate).toBeNull()
  })
})
