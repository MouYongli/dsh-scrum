import { describe, expect, it } from 'vitest'
import {
  SPRINT_STATUS,
  closeSprint,
  createSprint,
  startSprint,
  toIdentityId,
  toProjectId,
  toSprintId,
  toTimestamp,
  type Sprint,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const PROJECT = toProjectId(`prj_${ULID}`)
const OWNER = toIdentityId(`idt_${ULID}`)
const T1 = toTimestamp('2026-08-20T10:00:00Z')
const T2 = toTimestamp('2026-08-20T11:00:00Z')
const T3 = toTimestamp('2026-08-20T12:00:00Z')

function sprint(): Sprint {
  return createSprint({
    id: toSprintId('sprint-12'),
    projectId: PROJECT,
    name: 'Sprint 12',
    goal: '交付优惠券结算',
    startDate: toTimestamp('2026-09-01T00:00:00Z'),
    endDate: toTimestamp('2026-09-15T00:00:00Z'),
    createdBy: OWNER,
    now: T1,
  })
}

// Field names and value spellings here are the persisted format described in
// docs/development/architecture.md section 10.2. Changing any of them is a
// storage format change and needs a schema version bump plus a migration.
describe('sprint persistence contract', () => {
  it('stores the entity under a fixed set of fields', () => {
    expect(Object.keys(JSON.parse(JSON.stringify(sprint())) as object).sort()).toEqual(
      [
        'closedAt',
        'createdAt',
        'createdBy',
        'endDate',
        'goal',
        'id',
        'name',
        'projectId',
        'resultSummary',
        'revision',
        'schemaVersion',
        'startDate',
        'startedAt',
        'status',
        'updatedAt',
      ].sort(),
    )
  })

  // The storage rules forbid a sprint file from restating what a work item
  // already says. A list of members here would be a second answer to "who is
  // in this sprint", and the two would drift the first time a write half
  // succeeded.
  it('stores no list of the work items assigned to it', () => {
    const stored = JSON.parse(JSON.stringify(sprint())) as Record<string, unknown>

    for (const key of ['workItems', 'workItemIds', 'items', 'backlog']) {
      expect(key in stored).toBe(false)
    }
  })

  it('records the planned dates and the actual timestamps separately', () => {
    const closed = closeSprint(startSprint(sprint(), [sprint()], T2), [], '交付完成', T3)
    const stored = JSON.parse(JSON.stringify(closed)) as Record<string, unknown>

    expect(stored['status']).toBe(SPRINT_STATUS.closed)
    expect(stored['startDate']).toBe('2026-09-01T00:00:00.000Z')
    expect(stored['endDate']).toBe('2026-09-15T00:00:00.000Z')
    expect(stored['startedAt']).toBe('2026-08-20T11:00:00.000Z')
    expect(stored['closedAt']).toBe('2026-08-20T12:00:00.000Z')
    expect(stored['resultSummary']).toBe('交付完成')
  })

  it('leaves the actual timestamps null until they happen', () => {
    const stored = JSON.parse(JSON.stringify(sprint())) as Record<string, unknown>

    expect(stored['startedAt']).toBeNull()
    expect(stored['closedAt']).toBeNull()
    expect(stored['status']).toBe(SPRINT_STATUS.planned)
  })
})

describe('published sprint string surfaces', () => {
  it('pins the values stored in files', () => {
    expect(Object.values(SPRINT_STATUS)).toEqual(['planned', 'active', 'closed'])
  })
})
