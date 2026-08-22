import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ACTIVITY_SOURCE } from '@dsh-scrum/scrum-application'
import {
  activityFile,
  activityMonth,
  appendActivity,
  initialiseProject,
  listActivityMonths,
  readActivity,
  workspaceLayout,
  type ActivityRecord,
  type WorkspaceLayout,
} from '@dsh-scrum/adapter-storage-workspace-files'
import {
  EDITION,
  ERROR_CODE,
  createDefaultProjectConfig,
  createProject,
  toIdentityId,
  toProjectKey,
  toRevision,
  toTenantId,
  toTimestamp,
  type IdGenerator,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const ids: IdGenerator = { nextUlid: () => ULID }
const OWNER = toIdentityId(`idt_${ULID}`)
const T1 = toTimestamp('2026-08-20T10:00:00Z')

let root: string
let layout: WorkspaceLayout

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-scrum-activity-'))
  layout = workspaceLayout(root)
  const project = createProject({
    ids,
    tenantId: toTenantId(`tnt_${ULID}`),
    key: toProjectKey('SCR'),
    name: 'shop-service',
    createdBy: OWNER,
    now: T1,
  })
  await initialiseProject({
    workspaceRoot: root,
    project,
    config: createDefaultProjectConfig(project.id, T1),
    edition: EDITION.community,
  })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function record(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    at: T1,
    actorId: OWNER,
    source: ACTIVITY_SOURCE.ui,
    sessionId: null,
    action: 'workItem.update',
    targetType: 'workItem',
    targetId: 'SCR-1',
    revision: toRevision(2),
    ...overrides,
  }
}

describe('appending activity', () => {
  it('writes one line per record and reads them back in order', async () => {
    await appendActivity(layout, record({ action: 'first' }))
    await appendActivity(layout, record({ action: 'second' }))

    const { records, problems } = await readActivity(layout, '2026-08')

    expect(records.map((each) => each.action)).toEqual(['first', 'second'])
    expect(problems).toEqual([])
    expect(records[0]).toEqual(record({ action: 'first' }))
  })

  it('splits by the month the record happened in', async () => {
    await appendActivity(layout, record())
    await appendActivity(layout, record({ at: toTimestamp('2026-09-01T00:00:00Z') }))

    expect(activityMonth(T1)).toBe('2026-08')
    expect(await listActivityMonths(layout)).toEqual(['2026-08', '2026-09'])
    expect((await readActivity(layout, '2026-09')).records).toHaveLength(1)
  })

  // An agent's change has to be traceable to the conversation that asked for
  // it, or "the agent did it" is the end of the trail rather than the start.
  it('keeps the session a change was made from', async () => {
    await appendActivity(
      layout,
      record({ source: ACTIVITY_SOURCE.agent, sessionId: 'session_123' }),
    )

    const [stored] = (await readActivity(layout, '2026-08')).records
    expect(stored?.source).toBe(ACTIVITY_SOURCE.agent)
    expect(stored?.sessionId).toBe('session_123')
  })

  it('reads an empty result for a month that has nothing', async () => {
    expect(await readActivity(layout, '2026-01')).toEqual({ records: [], problems: [] })
    expect(await listActivityMonths(layout)).toEqual([])
  })

  it('refuses a month that is not a month', async () => {
    for (const month of ['2026', '2026-8', '../../etc/passwd']) {
      let code: unknown
      try {
        activityFile(layout, month)
      } catch (error) {
        code = (error as { code?: string }).code
      }
      expect(code, `expected ${month} to be refused`).toBe(ERROR_CODE.validation)
    }
  })
})

describe('a history damaged by an interrupted write', () => {
  // A crash during an append leaves a truncated last line. A reader that drops
  // it silently is a history that quietly lies about what happened.
  it('reports a line cut short rather than dropping it', async () => {
    await appendActivity(layout, record({ action: 'complete' }))
    await appendFile(activityFile(layout, '2026-08'), '{"at":"2026-08-2', 'utf8')

    const { records, problems } = await readActivity(layout, '2026-08')

    expect(records.map((each) => each.action)).toEqual(['complete'])
    expect(problems).toHaveLength(1)
    expect(problems[0]?.message).toMatch(/cut short/)
    expect(problems[0]?.message).toMatch(/:2/)
  })

  it('reports a line in the middle that cannot be read, and keeps the rest', async () => {
    const file = activityFile(layout, '2026-08')
    await writeFile(
      file,
      [
        JSON.stringify(record({ action: 'before' })),
        '{ not json',
        JSON.stringify(record({ action: 'after' })),
        JSON.stringify({ ...record({ action: 'wrong shape' }), source: 'telepathy' }),
        '',
      ].join('\n'),
      'utf8',
    )

    const { records, problems } = await readActivity(layout, '2026-08')

    expect(records.map((each) => each.action)).toEqual(['before', 'after'])
    expect(problems).toHaveLength(2)
    expect(problems[0]?.message).toMatch(/:2/)
    expect(problems[1]?.message).toMatch(/:4/)
  })

  it('leaves the damaged file alone, so the record can still be repaired', async () => {
    const file = activityFile(layout, '2026-08')
    await appendActivity(layout, record())
    await appendFile(file, 'truncated', 'utf8')
    const before = await readFile(file, 'utf8')

    await readActivity(layout, '2026-08')

    expect(await readFile(file, 'utf8')).toBe(before)
  })
})
