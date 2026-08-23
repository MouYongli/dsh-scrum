import { appendFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLocalActivityLog } from '@dsh-scrum/adapter-audit-local'
import {
  activityFile,
  activityMonth,
  listActivityMonths,
  readActivity,
  workspaceLayout,
} from '@dsh-scrum/adapter-storage-workspace-files'
import { ACTIVITY_SOURCE } from '@dsh-scrum/scrum-application'
import { toIdentityId, toRevision, toTimestamp } from '@dsh-scrum/scrum-domain'

const OWNER = toIdentityId('idt_01K5TFQ8Z4N7C2M9XPRWD3HABV')
const AUGUST = toTimestamp('2026-08-20T10:00:00.000Z')
const SEPTEMBER = toTimestamp('2026-09-01T10:00:00.000Z')

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-scrum-audit-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('recording what happened', () => {
  it('writes the event the application described, unchanged', async () => {
    await createLocalActivityLog(root).record({
      at: AUGUST,
      actorId: OWNER,
      source: ACTIVITY_SOURCE.agent,
      sessionId: 'session_1',
      action: 'workItem.create',
      targetType: 'workItem',
      targetId: 'SCR-1',
      revision: toRevision(1),
    })

    const { records, problems } = await readActivity(workspaceLayout(root), activityMonth(AUGUST))

    expect(problems).toEqual([])
    expect(records).toEqual([
      {
        at: AUGUST,
        actorId: OWNER,
        source: ACTIVITY_SOURCE.agent,
        sessionId: 'session_1',
        action: 'workItem.create',
        targetType: 'workItem',
        targetId: 'SCR-1',
        revision: toRevision(1),
      },
    ])
  })

  it('keeps a change made outside any session distinguishable from one inside', async () => {
    await createLocalActivityLog(root).record({
      at: AUGUST,
      actorId: OWNER,
      source: ACTIVITY_SOURCE.ui,
      sessionId: null,
      action: 'project.create',
      targetType: 'project',
      targetId: 'prj_1',
      revision: toRevision(1),
    })

    const { records } = await readActivity(workspaceLayout(root), activityMonth(AUGUST))

    expect(records[0]?.sessionId).toBeNull()
  })

  it('splits by month, so a busy project never rewrites one long file', async () => {
    const recorder = createLocalActivityLog(root)
    for (const at of [AUGUST, SEPTEMBER]) {
      await recorder.record({
        at,
        actorId: OWNER,
        source: ACTIVITY_SOURCE.system,
        sessionId: null,
        action: 'workItem.update',
        targetType: 'workItem',
        targetId: 'SCR-1',
        revision: null,
      })
    }

    expect(await listActivityMonths(workspaceLayout(root))).toEqual(['2026-08', '2026-09'])
  })

  it('records into a workspace that has no project directory yet', async () => {
    await expect(
      createLocalActivityLog(root).record({
        at: AUGUST,
        actorId: OWNER,
        source: ACTIVITY_SOURCE.system,
        sessionId: null,
        action: 'workspace.open',
        targetType: 'workspace',
        targetId: 'ws_1',
        revision: null,
      }),
    ).resolves.toBeUndefined()
  })
})

describe('reading it back', () => {
  async function record(at: string, targetId: string): Promise<void> {
    await createLocalActivityLog(root).record({
      at: toTimestamp(at),
      actorId: OWNER,
      source: ACTIVITY_SOURCE.ui,
      sessionId: null,
      action: 'workItem.update',
      targetType: 'workItem',
      targetId,
      revision: toRevision(1),
    })
  }

  it('answers newest first, across the months it is spread over', async () => {
    await record('2026-08-20T10:00:00.000Z', 'SCR-1')
    await record('2026-09-01T10:00:00.000Z', 'SCR-2')
    await record('2026-09-02T10:00:00.000Z', 'SCR-3')

    const history = await createLocalActivityLog(root).read({ limit: 10 })

    expect(history.events.map((event) => event.targetId)).toEqual(['SCR-3', 'SCR-2', 'SCR-1'])
    expect(history.problems).toEqual([])
  })

  it('stops at the limit, keeping the newest rather than whatever it read first', async () => {
    await record('2026-08-20T10:00:00.000Z', 'SCR-1')
    await record('2026-09-01T10:00:00.000Z', 'SCR-2')

    const history = await createLocalActivityLog(root).read({ limit: 1 })

    expect(history.events.map((event) => event.targetId)).toEqual(['SCR-2'])
  })

  it('leaves out what happened before the window starts', async () => {
    await record('2026-08-20T10:00:00.000Z', 'SCR-1')
    await record('2026-09-02T10:00:00.000Z', 'SCR-2')

    const history = await createLocalActivityLog(root).read({
      limit: 10,
      since: toTimestamp('2026-09-01T00:00:00.000Z'),
    })

    expect(history.events.map((event) => event.targetId)).toEqual(['SCR-2'])
  })

  it('reports a line an interrupted write cut short instead of dropping it quietly', async () => {
    await record('2026-08-20T10:00:00.000Z', 'SCR-1')
    const layout = workspaceLayout(root)
    await mkdir(layout.activities, { recursive: true })
    await appendFile(activityFile(layout, '2026-08'), '{"at":"2026-08-2', 'utf8')

    const history = await createLocalActivityLog(root).read({ limit: 10 })

    // The whole month is still answered: one unreadable tail is not a reason
    // to tell the user nothing happened in August.
    expect(history.events.map((event) => event.targetId)).toEqual(['SCR-1'])
    expect(history.problems).toHaveLength(1)
    expect(history.problems[0]).toContain('cut short')
  })

  it('says nothing happened in a workspace that never recorded anything', async () => {
    expect(await createLocalActivityLog(root).read({ limit: 10 })).toEqual({
      events: [],
      problems: [],
    })
  })
})
