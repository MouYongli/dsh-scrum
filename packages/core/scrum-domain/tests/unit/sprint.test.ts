import { describe, expect, it } from 'vitest'
import {
  ERROR_CODE,
  SPRINT_STATUS,
  assertSprintAcceptsWorkItems,
  closeSprint,
  createSprint,
  isScrumError,
  isSprintActive,
  rescheduleSprint,
  startSprint,
  toIdentityId,
  toProjectId,
  toSprintId,
  toSprintStatus,
  toTimestamp,
  unfinishedSprintWorkItems,
  updateSprintDetails,
  type Sprint,
  type SprintWorkItemState,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const PROJECT = toProjectId(`prj_${ULID}`)
const OWNER = toIdentityId(`idt_${ULID}`)
const START = toTimestamp('2026-09-01T00:00:00Z')
const END = toTimestamp('2026-09-15T00:00:00Z')
const T1 = toTimestamp('2026-08-20T10:00:00Z')
const T2 = toTimestamp('2026-08-20T11:00:00Z')
const T3 = toTimestamp('2026-08-20T12:00:00Z')
const T4 = toTimestamp('2026-08-20T13:00:00Z')

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

function sprint(id = 'sprint-1'): Sprint {
  return createSprint({
    id: toSprintId(id),
    projectId: PROJECT,
    name: `  ${id}  `,
    goal: '交付优惠券结算',
    startDate: START,
    endDate: END,
    createdBy: OWNER,
    now: T1,
  })
}

function state(id: string, sprintId: string | null, finished: boolean): SprintWorkItemState {
  return { id, sprintId: sprintId === null ? null : toSprintId(sprintId), finished }
}

describe('sprint creation', () => {
  it('starts planned, with no actual start or close recorded', () => {
    const created = sprint()

    expect(created.status).toBe(SPRINT_STATUS.planned)
    expect(created.name).toBe('sprint-1')
    expect(created.startedAt).toBeNull()
    expect(created.closedAt).toBeNull()
    expect(created.resultSummary).toBe('')
    expect(isSprintActive(created)).toBe(false)
  })

  it('refuses a sprint that does not end after it starts', () => {
    const base = {
      id: toSprintId('sprint-1'),
      projectId: PROJECT,
      name: 'sprint-1',
      createdBy: OWNER,
      now: T1,
    }

    expectRejects(() => createSprint({ ...base, startDate: END, endDate: START }), 'reversed dates')
    expectRejects(
      () => createSprint({ ...base, startDate: START, endDate: START }),
      'a zero length sprint',
    )
    expectRejects(
      () => createSprint({ ...base, name: '  ', startDate: START, endDate: END }),
      'a blank name',
    )
  })

  it('accepts only the published status spellings', () => {
    expect(toSprintStatus('closed')).toBe(SPRINT_STATUS.closed)
    expectRejects(() => toSprintStatus('cancelled'), 'a status this build does not know')
  })
})

describe('the sprint lifecycle', () => {
  it('runs planned to active to closed, recording when each happened', () => {
    const planned = sprint()
    const active = startSprint(planned, [planned], T2)
    const closed = closeSprint(active, [], '交付了优惠券结算', T3)

    expect(active.status).toBe(SPRINT_STATUS.active)
    expect(active.startedAt).toBe(T2)
    expect(closed.status).toBe(SPRINT_STATUS.closed)
    expect(closed.closedAt).toBe(T3)
    expect(closed.resultSummary).toBe('交付了优惠券结算')
    // The agreed box is untouched by when it actually opened and shut.
    expect(closed.startDate).toBe(START)
    expect(closed.endDate).toBe(END)
    expect(closed.revision).toBe(3)
  })

  it('refuses every transition that is not the next one', () => {
    const planned = sprint()
    const active = startSprint(planned, [planned], T2)
    const closed = closeSprint(active, [], '', T3)

    expectRejects(() => startSprint(active, [active], T3), 'starting an active sprint')
    expectRejects(() => startSprint(closed, [closed], T4), 'restarting a closed sprint')
    expectRejects(() => closeSprint(planned, [], '', T2), 'closing a sprint that never started')
    expectRejects(() => closeSprint(closed, [], '', T4), 'closing a closed sprint')
  })

  it('refuses a second active sprint in the same project', () => {
    const first = startSprint(sprint('sprint-1'), [sprint('sprint-1')], T2)
    const second = sprint('sprint-2')

    const error = caughtFrom(() => startSprint(second, [first, second], T3))
    expect(isScrumError(error) && error.details['activeSprintId']).toBe(first.id)
  })

  // The guard has to see the others to work at all, which is why they are a
  // required argument rather than something a caller checks separately.
  it('starts when the project has no other active sprint', () => {
    const closed = closeSprint(
      startSprint(sprint('sprint-1'), [sprint('sprint-1')], T2),
      [],
      '',
      T3,
    )
    const next = sprint('sprint-2')

    expect(startSprint(next, [closed, next], T4).status).toBe(SPRINT_STATUS.active)
  })
})

describe('closing and unfinished work', () => {
  it('refuses to close while an assigned item is unfinished, naming what blocks it', () => {
    const active = startSprint(sprint(), [sprint()], T2)
    const items = [
      state('SCR-1', 'sprint-1', true),
      state('SCR-2', 'sprint-1', false),
      state('SCR-3', null, false),
      state('SCR-4', 'sprint-2', false),
    ]

    expect(unfinishedSprintWorkItems(active, items)).toEqual(['SCR-2'])

    const error = caughtFrom(() => closeSprint(active, items, '', T3))
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
    expect(isScrumError(error) && error.details['unfinished']).toEqual(['SCR-2'])
  })

  it('closes once the unfinished item has been dealt with', () => {
    const active = startSprint(sprint(), [sprint()], T2)
    const dealtWith = [state('SCR-1', 'sprint-1', true), state('SCR-2', null, false)]

    expect(closeSprint(active, dealtWith, '', T3).status).toBe(SPRINT_STATUS.closed)
  })

  it('ignores items belonging to another sprint or to none', () => {
    const active = startSprint(sprint(), [sprint()], T2)

    expect(
      unfinishedSprintWorkItems(active, [
        state('SCR-9', 'sprint-2', false),
        state('SCR-8', null, false),
      ]),
    ).toEqual([])
  })
})

describe('sprint edits', () => {
  it('keeps the name and goal editable while it runs, and refuses once closed', () => {
    const active = startSprint(sprint(), [sprint()], T2)
    const renamed = updateSprintDetails(active, { goal: '交付优惠券结算与退款' }, T3)
    const closed = closeSprint(renamed, [], '', T4)

    expect(renamed.goal).toBe('交付优惠券结算与退款')
    expect(renamed.name).toBe('sprint-1')
    expectRejects(() => updateSprintDetails(closed, { name: 'x' }, T4), 'editing a closed sprint')
  })

  it('moves the dates only while the sprint is still planned', () => {
    const later = toTimestamp('2026-09-20T00:00:00Z')
    const planned = sprint()
    const rescheduled = rescheduleSprint(planned, START, later, T2)
    const active = startSprint(planned, [planned], T2)

    expect(rescheduled.endDate).toBe(later)
    expectRejects(() => rescheduleSprint(active, START, later, T3), 'rescheduling a running sprint')
    expectRejects(() => rescheduleSprint(planned, later, START, T2), 'reversed dates')
  })
})

describe('admitting work items', () => {
  it('accepts work while planned or active and refuses once closed', () => {
    const planned = sprint()
    const active = startSprint(planned, [planned], T2)
    const closed = closeSprint(active, [], '', T3)

    expect(caughtFrom(() => assertSprintAcceptsWorkItems(planned))).toBeUndefined()
    expect(caughtFrom(() => assertSprintAcceptsWorkItems(active))).toBeUndefined()
    expectRejects(() => assertSprintAcceptsWorkItems(closed), 'planning work into a closed sprint')
  })
})
