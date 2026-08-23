import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { toSprintId, toTimestamp, toWorkItemId } from '@dsh-scrum/scrum-domain'
import type { SprintProgressEntry } from '@dsh-scrum/scrum-application'
import {
  appendSprintProgress,
  readSprintProgress,
  sprintProgressFile,
  workspaceLayout,
} from '@dsh-scrum/adapter-storage-workspace-files'
import { temporaryWorkspace } from '../support/workspace.js'

const SPRINT = toSprintId('sprint-1')
const AT = toTimestamp('2026-08-24T09:00:00.000Z')

function baseline(overrides: Partial<SprintProgressEntry> = {}): SprintProgressEntry {
  return {
    kind: 'baseline',
    sprintId: SPRINT,
    recordedAt: AT,
    itemIds: [toWorkItemId('SCR-1'), toWorkItemId('SCR-2')],
    totalPoints: 8,
    unestimatedCount: 1,
    ...overrides,
  }
}

describe('the sprint progress log', () => {
  it('appends whole lines and reads them back in order', async () => {
    const root = await temporaryWorkspace('sprint-progress')
    const layout = workspaceLayout(root)

    await appendSprintProgress(layout, baseline())
    await appendSprintProgress(
      layout,
      baseline({ recordedAt: toTimestamp('2026-08-25T09:00:00.000Z') }),
    )
    const { entries, problems } = await readSprintProgress(layout, SPRINT)

    expect(problems).toEqual([])
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual(baseline())
    expect((await readFile(sprintProgressFile(layout, SPRINT), 'utf8')).endsWith('\n')).toBe(true)
  })

  it('keeps one sprint out of another sprint file', async () => {
    const root = await temporaryWorkspace('sprint-progress')
    const layout = workspaceLayout(root)
    const other = toSprintId('sprint-2')

    await appendSprintProgress(layout, baseline())
    await appendSprintProgress(layout, baseline({ sprintId: other, totalPoints: 21 }))

    expect((await readSprintProgress(layout, SPRINT)).entries).toHaveLength(1)
    expect((await readSprintProgress(layout, other)).entries[0]?.totalPoints).toBe(21)
  })

  it('reports a last line cut short by an interrupted write', async () => {
    const root = await temporaryWorkspace('sprint-progress')
    const layout = workspaceLayout(root)
    await appendSprintProgress(layout, baseline())
    await mkdir(layout.sprintProgressLog, { recursive: true })
    await appendFile(sprintProgressFile(layout, SPRINT), '{"kind":"baseline","sprin', 'utf8')

    const { entries, problems } = await readSprintProgress(layout, SPRINT)

    // The record that landed is still returned. Dropping the tail in silence
    // would leave a baseline nobody can see is incomplete.
    expect(entries).toHaveLength(1)
    expect(problems).toHaveLength(1)
    expect(problems[0]?.message).toContain('cut short')
  })

  it('refuses a kind this build does not know, and reports which line', async () => {
    const root = await temporaryWorkspace('sprint-progress')
    const layout = workspaceLayout(root)
    await mkdir(layout.sprintProgressLog, { recursive: true })
    await appendFile(
      sprintProgressFile(layout, SPRINT),
      `${JSON.stringify({ ...baseline(), kind: 'daily' })}\n`,
      'utf8',
    )

    const { entries, problems } = await readSprintProgress(layout, SPRINT)

    expect(entries).toEqual([])
    expect(problems[0]?.message).toContain('baseline')
  })

  it('reads nothing for a sprint that never started', async () => {
    const layout = workspaceLayout(await temporaryWorkspace('sprint-progress'))

    expect(await readSprintProgress(layout, SPRINT)).toEqual({ entries: [], problems: [] })
  })
})
