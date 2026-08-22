import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLocalActivityRecorder } from '@dsh-scrum/adapter-audit-local'
import {
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
    await createLocalActivityRecorder(root).record({
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
    await createLocalActivityRecorder(root).record({
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
    const recorder = createLocalActivityRecorder(root)
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
      createLocalActivityRecorder(root).record({
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
