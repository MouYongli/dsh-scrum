import { describe, expect, it } from 'vitest'
import {
  BUG_SEVERITY,
  ERROR_CODE,
  WORK_ITEM_TYPE,
  bugDetails,
  createWorkItem,
  epicDetails,
  isScrumError,
  rankBetween,
  taskDetails,
  toBugSeverity,
  toIdentityId,
  toProjectId,
  toTimestamp,
  toWorkItemDetails,
  toWorkItemId,
  updateWorkItemDetails,
  type WorkItem,
  type WorkItemDetails,
  type WorkItemType,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const PROJECT = toProjectId(`prj_${ULID}`)
const REPORTER = toIdentityId(`idt_${ULID}`)
const T1 = toTimestamp('2026-08-20T10:00:00Z')
const T2 = toTimestamp('2026-08-20T11:00:00Z')

function expectRejects(run: () => unknown, what: string): void {
  let caught: unknown
  try {
    run()
  } catch (error) {
    caught = error
  }
  expect(isScrumError(caught) && caught.code, `expected ${what} to be rejected`).toBe(
    ERROR_CODE.validation,
  )
}

function item(type: WorkItemType, details?: WorkItemDetails): WorkItem {
  return createWorkItem({
    id: toWorkItemId('SCR-1'),
    projectId: PROJECT,
    type,
    title: '一条工作项',
    reporterId: REPORTER,
    rank: rankBetween(null, null),
    parentId: type === WORK_ITEM_TYPE.subtask ? toWorkItemId('SCR-9') : null,
    typeDetails: details,
    now: T1,
  })
}

describe('the fields a type carries', () => {
  it('gives each type its own shape and fills every field', () => {
    expect(item(WORK_ITEM_TYPE.epic).typeDetails).toEqual({ color: '' })
    expect(item(WORK_ITEM_TYPE.task).typeDetails).toEqual({ timebox: null, outcome: '' })
    expect(item(WORK_ITEM_TYPE.story).typeDetails).toEqual({})
    expect(item(WORK_ITEM_TYPE.subtask).typeDetails).toEqual({})
    expect(item(WORK_ITEM_TYPE.bug).typeDetails).toEqual({
      severity: null,
      stepsToReproduce: '',
      expected: '',
      actual: '',
      environment: '',
      affectedVersion: '',
      isRegression: false,
      rootCause: '',
    })
  })

  it('reads the details back through the type they sit beside', () => {
    const bug = item(WORK_ITEM_TYPE.bug, {
      severity: BUG_SEVERITY.blocker,
      stepsToReproduce: '1. 打开设置\n2. 点击保存',
      expected: '保存成功',
      actual: '页面白屏',
      environment: 'macOS 15',
      affectedVersion: '0.4.1',
      isRegression: true,
      rootCause: '',
    })

    expect(bugDetails(bug)?.severity).toBe(BUG_SEVERITY.blocker)
    // Pasted prose keeps its line breaks; a title would not be allowed any.
    expect(bugDetails(bug)?.stepsToReproduce).toBe('1. 打开设置\n2. 点击保存')
    expect(bugDetails(bug)?.isRegression).toBe(true)
    expect(epicDetails(bug)).toBeNull()
    expect(taskDetails(bug)).toBeNull()
    expect(epicDetails(item(WORK_ITEM_TYPE.epic, { color: '#3366ff' }))?.color).toBe('#3366ff')
    expect(taskDetails(item(WORK_ITEM_TYPE.task, { timebox: 3, outcome: '选 B 方案' }))).toEqual({
      timebox: 3,
      outcome: '选 B 方案',
    })
  })

  it('keeps severity apart from priority and takes only its own spellings', () => {
    expect(toBugSeverity('blocker')).toBe(BUG_SEVERITY.blocker)
    expect(Object.values(BUG_SEVERITY)).toEqual(['blocker', 'major', 'minor', 'trivial'])
    // The priority words are deliberately not severity words: a shared
    // vocabulary reads as one field split in two.
    expectRejects(() => toBugSeverity('critical'), 'a priority word as a severity')
  })

  it('refuses a field of the wrong shape and a timebox outside its bounds', () => {
    expectRejects(
      () => toWorkItemDetails(WORK_ITEM_TYPE.bug, { isRegression: 'yes' }),
      'a regression flag as text',
    )
    expectRejects(() => toWorkItemDetails(WORK_ITEM_TYPE.epic, { color: 7 }), 'a numeric colour')
    expectRejects(() => toWorkItemDetails(WORK_ITEM_TYPE.task, { timebox: 0 }), 'a zero timebox')
    expectRejects(() => toWorkItemDetails(WORK_ITEM_TYPE.task, { timebox: 1.5 }), 'half a day')
    expectRejects(() => toWorkItemDetails(WORK_ITEM_TYPE.task, { timebox: 400 }), 'a year and more')
    expectRejects(() => toWorkItemDetails(WORK_ITEM_TYPE.bug, []), 'an array of details')
  })

  it('refuses details tagged with another type, and takes a matching tag', () => {
    // A caller carrying details across a boundary tags them, because an edit
    // can leave the type alone and only the far side knows what it is. A tag
    // that disagrees would otherwise cost every field beside it, in silence.
    expectRejects(
      () => toWorkItemDetails(WORK_ITEM_TYPE.epic, { type: 'bug', severity: 'blocker' }),
      'bug details handed over as an epic',
    )
    expect(toWorkItemDetails(WORK_ITEM_TYPE.epic, { type: 'epic', color: '#fff' })).toEqual({
      color: '#fff',
    })
  })

  it('ignores a key the type does not carry', () => {
    // Only a caller confusing two types sends one, and the API contract parses
    // strictly long before anything reaches the domain.
    expect(toWorkItemDetails(WORK_ITEM_TYPE.epic, { color: '#fff', severity: 'blocker' })).toEqual({
      color: '#fff',
    })
  })
})

describe('details across a type change', () => {
  it('replaces them rather than carrying fields across', () => {
    const bug = item(WORK_ITEM_TYPE.bug, {
      severity: BUG_SEVERITY.major,
      stepsToReproduce: '重启后必现',
      expected: '',
      actual: '',
      environment: '',
      affectedVersion: '',
      isRegression: false,
      rootCause: '',
    })
    const asTask = updateWorkItemDetails(bug, { type: WORK_ITEM_TYPE.task }, T2)

    expect(asTask.typeDetails).toEqual({ timebox: null, outcome: '' })
    expect(bugDetails(asTask)).toBeNull()
  })

  it('leaves them alone when the type does not move', () => {
    const epic = item(WORK_ITEM_TYPE.epic, { color: '#3366ff' })

    expect(updateWorkItemDetails(epic, { title: '换个标题' }, T2).typeDetails).toEqual({
      color: '#3366ff',
    })
    expect(
      epicDetails(updateWorkItemDetails(epic, { typeDetails: { color: '#ff0000' } }, T2))?.color,
    ).toBe('#ff0000')
  })
})
