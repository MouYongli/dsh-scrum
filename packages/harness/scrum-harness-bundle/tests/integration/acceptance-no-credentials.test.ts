import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  activityMonth,
  readActivity,
  workspaceLayout,
} from '@dsh-scrum/adapter-storage-workspace-files'
import { ACCESS_MODE } from '@dsh-scrum/scrum-application'
import { WORK_ITEM_TYPE, toProjectKey, toTimestamp } from '@dsh-scrum/scrum-domain'
import { installation, type Installation } from '../support/installation.js'

// `.scrum/` is committed to the user's repository as often as not, so what
// goes in it is a release criterion and not a detail. This walks everything a
// full run wrote and asserts what is not in it.

let app: Installation

beforeEach(async () => {
  app = await installation('no-credentials')
})

afterEach(async () => {
  await app.dispose()
})

/** Every file under `.scrum/`, with its contents. */
async function storedFiles(): Promise<readonly { path: string; text: string }[]> {
  const files: { path: string; text: string }[] = []
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
      } else {
        files.push({ path, text: await readFile(path, 'utf8') })
      }
    }
  }
  await walk(workspaceLayout(app.root).scrum)
  return files
}

async function fullRun(): Promise<void> {
  await app.host.initialise({ key: toProjectKey('SCR'), name: 'shop-service' })
  await app.host.setSessionAccess(ACCESS_MODE.write)
  const item = await app.agent().createWorkItem({ type: WORK_ITEM_TYPE.story, title: '结算对账' })
  const sprint = await app.host.createSprint({
    name: '第一个 Sprint',
    startDate: toTimestamp('2026-09-01T00:00:00.000Z'),
    endDate: toTimestamp('2026-09-15T00:00:00.000Z'),
  })
  await app.host.planSprint({
    sprintId: sprint.id,
    items: [{ workItemId: item.id, expectedRevision: item.revision }],
  })
  // Attaching records the binding, which is the last of the local-state files.
  await app.host.attach(item.projectId)
}

describe('what a full run leaves on disk', () => {
  it('never writes a field that could hold a secret', async () => {
    await fullRun()

    const suspicious =
      /"[^"]*(token|password|secret|credential|api[_-]?key|authorization)[^"]*"\s*:/i

    for (const file of await storedFiles()) {
      expect(file.text, file.path).not.toMatch(suspicious)
    }
  })

  it('never writes the workspace path, which can name a person or a client', async () => {
    await fullRun()

    for (const file of await storedFiles()) {
      expect(file.text, file.path).not.toContain(app.root)
    }
  })

  it('records only a reference to the conversation, never anything said in it', async () => {
    await fullRun()

    const layout = workspaceLayout(app.root)
    const { records, problems } = await readActivity(
      layout,
      activityMonth(toTimestamp(new Date().toISOString())),
    )

    expect(problems).toEqual([])
    expect(records).not.toEqual([])
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual([
        'action',
        'actorId',
        'at',
        'revision',
        'sessionId',
        'source',
        'targetId',
        'targetType',
      ])
    }
  })

  it('names the conversation the agent worked in, so a change leads back to it', async () => {
    await fullRun()

    const { records } = await readActivity(
      workspaceLayout(app.root),
      activityMonth(toTimestamp(new Date().toISOString())),
    )

    expect(records.some((record) => record.sessionId === app.session.id)).toBe(true)
  })

  it('writes every file as something a person can read and repair', async () => {
    await fullRun()

    for (const file of await storedFiles()) {
      const lines = file.text.split('\n').filter((line) => line !== '')
      const parsed = file.path.endsWith('.jsonl')
        ? lines.map((line) => JSON.parse(line) as unknown)
        : [JSON.parse(file.text) as unknown]

      expect(parsed.length, file.path).toBeGreaterThan(0)
    }
  })
})
