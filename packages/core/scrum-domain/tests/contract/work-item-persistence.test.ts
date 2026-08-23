import { describe, expect, it } from 'vitest'
import {
  PRIORITY,
  WORK_ITEM_TYPE,
  assignWorkItemToSprint,
  blockWorkItem,
  createWorkItem,
  moveWorkItemStatus,
  rankBetween,
  toIdentityId,
  toProjectId,
  toRank,
  toSprintId,
  toTimestamp,
  toWorkItemId,
  updateWorkItemDetails,
  WORK_ITEM_STATUS,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const PROJECT = toProjectId(`prj_${ULID}`)
const REPORTER = toIdentityId(`idt_${ULID}`)
const T1 = toTimestamp('2026-08-20T10:00:00Z')
const T2 = toTimestamp('2026-08-20T11:00:00Z')
const T3 = toTimestamp('2026-08-20T12:00:00Z')

function item(): WorkItem {
  return createWorkItem({
    id: toWorkItemId('SCR-12'),
    projectId: PROJECT,
    type: WORK_ITEM_TYPE.story,
    title: '用户使用优惠券',
    rank: rankBetween(null, null),
    reporterId: REPORTER,
    now: T1,
  })
}

// Field names and value spellings here are the persisted format described in
// docs/development/architecture.md section 10.2. Renaming or removing one is a
// storage format change and needs a schema version bump plus a migration.
// Adding a field is additive: a reader of the older shape supplies a default
// for what is absent, so the version stays where it is and this list grows.
describe('work item persistence contract', () => {
  it('stores the entity under a fixed set of fields', () => {
    expect(Object.keys(JSON.parse(JSON.stringify(item())) as object).sort()).toEqual(
      [
        'acceptanceCriteria',
        'assigneeId',
        'blockedReason',
        'createdAt',
        'dependsOn',
        'description',
        'estimate',
        'id',
        'labels',
        'level',
        'parentId',
        'priority',
        'projectId',
        'rank',
        'reporterId',
        'revision',
        'schemaVersion',
        'sprintId',
        'status',
        'title',
        'type',
        'updatedAt',
      ].sort(),
    )
  })

  it('matches the sample in the architecture document field for field', () => {
    const planned = assignWorkItemToSprint(item(), toSprintId('sprint-12'), T2)
    const started = moveWorkItemStatus(planned, WORK_ITEM_STATUS.inProgress, T3)
    const stored = JSON.parse(JSON.stringify(started)) as Record<string, unknown>

    expect(stored['schemaVersion']).toBe(1)
    expect(stored['id']).toBe('SCR-12')
    expect(stored['projectId']).toBe(`prj_${ULID}`)
    expect(stored['type']).toBe('story')
    expect(stored['status']).toBe('in_progress')
    expect(stored['sprintId']).toBe('sprint-12')
    expect(stored['parentId']).toBeNull()
    expect(stored['revision']).toBe(3)
    expect(stored['createdAt']).toBe('2026-08-20T10:00:00.000Z')
    expect(stored['updatedAt']).toBe('2026-08-20T12:00:00.000Z')
    expect(toRank(stored['rank'] as string)).toBe(started.rank)
  })

  // Blocking is one nullable reason, not a flag beside it. A stored `blocked`
  // could disagree with the reason next to it, which is the state the product
  // design forbids, so the file must never grow one.
  it('stores blocking as a reason with no separate flag', () => {
    const blocked = JSON.parse(JSON.stringify(blockWorkItem(item(), '等待支付网关', T2))) as Record<
      string,
      unknown
    >

    expect(blocked['blockedReason']).toBe('等待支付网关')
    expect('blocked' in blocked).toBe(false)
    expect(JSON.parse(JSON.stringify(item()))).toMatchObject({ blockedReason: null })
  })

  it('stores an acceptance criterion as text and its state, with no identifier', () => {
    const withCriteria = updateWorkItemDetails(
      item(),
      { acceptanceCriteria: [{ text: '优惠券可叠加', satisfied: false }] },
      T2,
    )
    const stored = JSON.parse(JSON.stringify(withCriteria)) as Record<string, unknown>

    expect(stored['acceptanceCriteria']).toEqual([{ text: '优惠券可叠加', satisfied: false }])
  })
})

describe('published work item string surfaces', () => {
  it('pins the values stored in files', () => {
    expect(Object.values(WORK_ITEM_TYPE)).toEqual(['epic', 'story', 'task', 'bug', 'subtask'])
    expect(Object.values(PRIORITY)).toEqual(['low', 'medium', 'high', 'critical'])
  })
})
