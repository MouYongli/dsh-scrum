import { describe, expect, it } from 'vitest'
import { toTimestamp } from '@dsh-scrum/scrum-domain'
import { EMPTY_SPRINT_FIELDS, toDay, toNewSprint, toSprintDate } from '@dsh-scrum/scrum-ui'

describe('what a calendar date means to a sprint', () => {
  it('reads the day as the instant it starts in UTC', () => {
    expect(toSprintDate('2026-03-16')).toBe(toTimestamp('2026-03-16T00:00:00.000Z'))
  })

  it('spells a stored instant back as the same day', () => {
    expect(toDay(toTimestamp('2026-03-16T00:00:00.000Z'))).toBe('2026-03-16')
  })

  it('refuses a day that is not one, rather than inventing an instant', () => {
    expect(() => toSprintDate('下周一')).toThrow()
  })
})

describe('what the creation form submits', () => {
  it('trims the name and carries both dates', () => {
    expect(
      toNewSprint({
        ...EMPTY_SPRINT_FIELDS,
        name: '  第一个 Sprint  ',
        goal: '打通结算',
        startDate: '2026-03-16',
        endDate: '2026-03-30',
      }),
    ).toEqual({
      name: '第一个 Sprint',
      goal: '打通结算',
      startDate: toTimestamp('2026-03-16T00:00:00.000Z'),
      endDate: toTimestamp('2026-03-30T00:00:00.000Z'),
    })
  })
})
