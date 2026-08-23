import { describe, expect, it } from 'vitest'
import {
  BOARD_STATUSES,
  DEFAULT_PERMISSION_POLICY,
  DEFAULT_WORKFLOW_STATUSES,
  ERROR_CODE,
  DEFAULT_STALLED_AFTER_DAYS,
  ESTIMATION_METHOD,
  VELOCITY_BASIS,
  toVelocityBasis,
  IDENTITY_KIND,
  PERMISSION,
  PROJECT_ROLE,
  WORK_ITEM_STATUS,
  createDefaultProjectConfig,
  createLocalIdentity,
  isBoardStatus,
  isScrumError,
  statusRank,
  toEstimationMethod,
  toIdentityKind,
  toProjectId,
  toTimestamp,
  toWorkItemStatus,
  updateProjectConfig,
  type IdGenerator,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const ids: IdGenerator = { nextUlid: () => ULID }
const PROJECT = toProjectId(`prj_${ULID}`)
const NOW = toTimestamp('2026-08-20T10:00:00Z')
const LATER = toTimestamp('2026-08-20T12:00:00Z')

function caughtFrom(run: () => unknown): unknown {
  try {
    run()
    return undefined
  } catch (error) {
    return error
  }
}

function expectRejects(run: () => unknown, what: string): void {
  const error = caughtFrom(run)
  expect(isScrumError(error) && error.code, `expected ${what} to be rejected`).toBe(
    ERROR_CODE.validation,
  )
}

describe('the default workflow', () => {
  it('runs from backlog to done in order', () => {
    expect(DEFAULT_WORKFLOW_STATUSES).toEqual([
      WORK_ITEM_STATUS.backlog,
      WORK_ITEM_STATUS.todo,
      WORK_ITEM_STATUS.inProgress,
      WORK_ITEM_STATUS.review,
      WORK_ITEM_STATUS.done,
    ])
    expect(statusRank(WORK_ITEM_STATUS.backlog)).toBeLessThan(statusRank(WORK_ITEM_STATUS.done))
  })

  it('keeps the backlog and done off the work in progress columns', () => {
    expect(BOARD_STATUSES).toEqual([
      WORK_ITEM_STATUS.todo,
      WORK_ITEM_STATUS.inProgress,
      WORK_ITEM_STATUS.review,
    ])
    expect(isBoardStatus(WORK_ITEM_STATUS.backlog)).toBe(false)
    expect(isBoardStatus(WORK_ITEM_STATUS.inProgress)).toBe(true)
  })

  it('accepts only the persisted spelling of a status', () => {
    expect(toWorkItemStatus('in_progress')).toBe(WORK_ITEM_STATUS.inProgress)
    expectRejects(() => toWorkItemStatus('in-progress'), 'the hyphenated spelling')
    expectRejects(() => toWorkItemStatus('In Progress'), 'a display name as a status')
  })
})

describe('project configuration', () => {
  it('starts on the default workflow with no limits set', () => {
    const config = createDefaultProjectConfig(PROJECT, NOW)

    expect(config.projectId).toBe(PROJECT)
    expect(config.statuses).toEqual(DEFAULT_WORKFLOW_STATUSES)
    expect(config.estimationMethod).toBe(ESTIMATION_METHOD.storyPoints)
    expect(config.workInProgressLimit).toBeNull()
    expect(config.definitionOfDone).toEqual([])
    expect(config.permissionPolicy).toEqual(DEFAULT_PERMISSION_POLICY)
    expect(config.definitionOfReady).toEqual([])
    // Velocity is a claim about what a team can deliver, so a sprint rescued
    // by abandoning half its work must not read as a fast one.
    expect(config.velocityBasis).toBe(VELOCITY_BASIS.delivered)
    expect(config.stalledAfterDays).toBe(DEFAULT_STALLED_AFTER_DAYS)
    expect(config.revision).toBe(1)
  })

  it('holds both checklists to the same limits, because they are one kind of thing', () => {
    const config = createDefaultProjectConfig(PROJECT, NOW)
    const tuned = updateProjectConfig(
      config,
      { definitionOfReady: ['有验收标准', '已估算'], definitionOfDone: ['已评审'] },
      LATER,
    )

    expect(tuned.definitionOfReady).toEqual(['有验收标准', '已估算'])
    expect(tuned.definitionOfDone).toEqual(['已评审'])
    for (const entries of [{ definitionOfReady: [''] }, { definitionOfDone: [''] }]) {
      expectRejects(() => updateProjectConfig(config, entries, LATER), 'a blank entry')
    }
    expectRejects(
      () => updateProjectConfig(config, { definitionOfReady: Array<string>(51).fill('x') }, LATER),
      'a checklist nobody would read',
    )
  })

  it('bounds how long an item may sit before a board calls it stalled', () => {
    const config = createDefaultProjectConfig(PROJECT, NOW)

    expect(updateProjectConfig(config, { stalledAfterDays: 7 }, LATER).stalledAfterDays).toBe(7)
    expectRejects(() => updateProjectConfig(config, { stalledAfterDays: 0 }, LATER), 'no wait')
    expectRejects(() => updateProjectConfig(config, { stalledAfterDays: 61 }, LATER), 'two months')
  })

  it('takes either velocity basis and refuses anything else', () => {
    const config = createDefaultProjectConfig(PROJECT, NOW)

    expect(
      updateProjectConfig(config, { velocityBasis: VELOCITY_BASIS.finished }, LATER).velocityBasis,
    ).toBe(VELOCITY_BASIS.finished)
    expect(() => toVelocityBasis('guessed')).toThrow()
  })

  it('changes only the fields it is given, advancing the revision once', () => {
    const config = createDefaultProjectConfig(PROJECT, NOW)
    const updated = updateProjectConfig(config, { sprintLengthInDays: 7 }, LATER)

    expect(updated.sprintLengthInDays).toBe(7)
    expect(updated.estimationMethod).toBe(config.estimationMethod)
    expect(updated.definitionOfDone).toEqual(config.definitionOfDone)
    expect(updated.revision).toBe(2)
  })

  it('bounds the sprint length and the work in progress limit', () => {
    const config = createDefaultProjectConfig(PROJECT, NOW)

    expectRejects(() => updateProjectConfig(config, { sprintLengthInDays: 0 }, LATER), 'a zero')
    expectRejects(() => updateProjectConfig(config, { sprintLengthInDays: 29 }, LATER), 'a quarter')
    expectRejects(() => updateProjectConfig(config, { workInProgressLimit: 0 }, LATER), 'a zero')
    expect(
      updateProjectConfig(config, { workInProgressLimit: null }, LATER).workInProgressLimit,
    ).toBeNull()
  })

  it('renames a column only for a status the workflow knows', () => {
    const config = createDefaultProjectConfig(PROJECT, NOW)
    const renamed = updateProjectConfig(
      config,
      { statusDisplayNames: { in_progress: '进行中' } },
      LATER,
    )

    expect(renamed.statusDisplayNames).toEqual({ in_progress: '进行中' })
    expectRejects(
      () => updateProjectConfig(config, { statusDisplayNames: { shipped: '已发布' } }, LATER),
      'a display name for an unknown status',
    )
  })

  it('validates the permission policy it is given', () => {
    const config = createDefaultProjectConfig(PROJECT, NOW)
    const opened = updateProjectConfig(
      config,
      { permissionPolicy: { [PERMISSION.projectConfigure]: [PROJECT_ROLE.scrumMaster] } },
      LATER,
    )

    expect(opened.permissionPolicy).toEqual({
      [PERMISSION.projectConfigure]: [PROJECT_ROLE.scrumMaster],
    })
    expectRejects(
      () =>
        updateProjectConfig(
          config,
          { permissionPolicy: { [PERMISSION.projectArchive]: [PROJECT_ROLE.developer] } },
          LATER,
        ),
      'a policy on a cell the matrix fixes',
    )
  })

  it('rejects an unknown estimation method and a blank definition of done entry', () => {
    const config = createDefaultProjectConfig(PROJECT, NOW)

    expect(toEstimationMethod('hours')).toBe(ESTIMATION_METHOD.hours)
    expectRejects(() => toEstimationMethod('t-shirts'), 'an unknown estimation method')
    expectRejects(
      () => updateProjectConfig(config, { definitionOfDone: ['reviewed', '  '] }, LATER),
      'a blank definition of done entry',
    )
    expect(
      updateProjectConfig(config, { definitionOfDone: ['reviewed'] }, LATER).definitionOfDone,
    ).toEqual(['reviewed'])
  })
})

describe('local identity', () => {
  it('mints a prefixed identifier and trims the display name', () => {
    const identity = createLocalIdentity({ ids, displayName: '  Yongli  ' })

    expect(identity.id).toBe(`idt_${ULID}`)
    expect(identity.kind).toBe(IDENTITY_KIND.local)
    expect(identity.displayName).toBe('Yongli')
    expect(toIdentityKind('directory')).toBe(IDENTITY_KIND.directory)
    expectRejects(() => toIdentityKind('anonymous'), 'an unknown identity kind')
    expectRejects(() => createLocalIdentity({ ids, displayName: '' }), 'a blank display name')
  })
})
