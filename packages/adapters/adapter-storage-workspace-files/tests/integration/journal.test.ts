import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  NEW_ENTITY,
  initialiseProject,
  recoverOperations,
  runOperation,
  saveWorkItem,
  scanWorkspace,
  workItemFile,
  workspaceLayout,
  encodeWorkItem,
  type WorkspaceLayout,
} from '@dsh-scrum/adapter-storage-workspace-files'
import {
  EDITION,
  ERROR_CODE,
  WORK_ITEM_TYPE,
  createDefaultProjectConfig,
  createProject,
  createWorkItem,
  isScrumError,
  rankBetween,
  toIdentityId,
  toProjectKey,
  toRevision,
  toTenantId,
  toTimestamp,
  toWorkItemId,
  updateWorkItemDetails,
  type IdGenerator,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const ids: IdGenerator = { nextUlid: () => ULID }
const OWNER = toIdentityId(`idt_${ULID}`)
const T1 = toTimestamp('2026-08-20T10:00:00Z')
const T2 = toTimestamp('2026-08-20T11:00:00Z')

let root: string
let layout: WorkspaceLayout

const project = createProject({
  ids,
  tenantId: toTenantId(`tnt_${ULID}`),
  key: toProjectKey('SCR'),
  name: 'shop-service',
  createdBy: OWNER,
  now: T1,
})

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-scrum-journal-'))
  layout = workspaceLayout(root)
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

function item(key: string): WorkItem {
  return createWorkItem({
    id: toWorkItemId(key),
    projectId: project.id,
    type: WORK_ITEM_TYPE.task,
    title: key,
    reporterId: OWNER,
    rank: rankBetween(null, null),
    now: T1,
  })
}

function fileOf(key: string): string {
  return workItemFile(layout, toWorkItemId(key))
}

function renamed(key: string, title: string): WorkItem {
  return updateWorkItemDetails(item(key), { title }, T2)
}

async function caughtFrom(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
    return undefined
  } catch (error) {
    return error
  }
}

async function titles(): Promise<Record<string, string>> {
  const snapshot = await scanWorkspace(root)
  return Object.fromEntries([...snapshot.workItems.values()].map((each) => [each.id, each.title]))
}

async function pending(): Promise<readonly string[]> {
  return await readdir(layout.pendingOperations)
}

describe('applying several writes as one operation', () => {
  it('writes them all and leaves no journal behind', async () => {
    await runOperation(layout, {
      id: 'op-1',
      kind: 'plan-sprint',
      at: T2,
      writes: [
        { file: fileOf('SCR-1'), content: encodeWorkItem(item('SCR-1')), expected: NEW_ENTITY },
        { file: fileOf('SCR-2'), content: encodeWorkItem(item('SCR-2')), expected: NEW_ENTITY },
      ],
    })

    expect(await titles()).toEqual({ 'SCR-1': 'SCR-1', 'SCR-2': 'SCR-2' })
    expect(await pending()).toEqual([])
  })

  // The whole point of a journal: one stale revision must stop the operation
  // while the store is still untouched, not halfway through it.
  it('applies nothing when any expected revision is stale', async () => {
    await saveWorkItem(root, item('SCR-1'), NEW_ENTITY)

    const error = await caughtFrom(() =>
      runOperation(layout, {
        id: 'op-2',
        kind: 'plan-sprint',
        at: T2,
        writes: [
          {
            file: fileOf('SCR-1'),
            content: encodeWorkItem(renamed('SCR-1', 'moved')),
            expected: toRevision(1),
          },
          {
            file: fileOf('SCR-2'),
            content: encodeWorkItem(item('SCR-2')),
            expected: toRevision(7),
          },
        ],
      }),
    )

    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.conflict)
    expect(await titles()).toEqual({ 'SCR-1': 'SCR-1' })
    expect(await pending()).toEqual([])
  })

  it('refuses an operation that writes nothing', async () => {
    const error = await caughtFrom(() =>
      runOperation(layout, { id: 'op-3', kind: 'nothing', at: T2, writes: [] }),
    )

    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
  })

  // A file that did not exist before must not be left holding a value nothing
  // ever agreed to.
  it('puts everything back when a later write fails', async () => {
    await saveWorkItem(root, item('SCR-1'), NEW_ENTITY)

    const error = await caughtFrom(() =>
      runOperation(layout, {
        id: 'op-4',
        kind: 'plan-sprint',
        at: T2,
        writes: [
          {
            file: fileOf('SCR-1'),
            content: encodeWorkItem(renamed('SCR-1', 'moved')),
            expected: toRevision(1),
          },
          { file: fileOf('SCR-2'), content: encodeWorkItem(item('SCR-2')), expected: NEW_ENTITY },
          // Its directory does not exist, so the write fails after two have
          // already landed.
          {
            file: join(layout.workItems, 'missing', 'SCR-3.json'),
            content: encodeWorkItem(item('SCR-3')),
            expected: NEW_ENTITY,
          },
        ],
      }),
    )

    expect(error).toBeDefined()
    expect(await titles()).toEqual({ 'SCR-1': 'SCR-1' })
    expect(await pending()).toEqual([])
  })
})

describe('recovering after a crash', () => {
  /** A journal left on disk with none of its writes applied. */
  async function crashAfterJournalling(): Promise<void> {
    const entries = [
      {
        file: fileOf('SCR-1'),
        after: `${JSON.stringify(encodeWorkItem(renamed('SCR-1', 'moved')), null, 2)}\n`,
        before: await readFile(fileOf('SCR-1'), 'utf8'),
      },
      {
        file: fileOf('SCR-2'),
        after: `${JSON.stringify(encodeWorkItem(item('SCR-2')), null, 2)}\n`,
        before: null,
      },
    ]
    await writeFile(
      join(layout.pendingOperations, 'op-crash.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'op-crash',
        kind: 'plan-sprint',
        startedAt: T2,
        entries,
      }),
      'utf8',
    )
  }

  it('finishes an operation whose writes never landed', async () => {
    await saveWorkItem(root, item('SCR-1'), NEW_ENTITY)
    await crashAfterJournalling()

    const recovered = await recoverOperations(layout)

    expect(recovered).toHaveLength(1)
    expect(recovered[0]?.kind).toBe('plan-sprint')
    expect(recovered[0]?.files).toHaveLength(2)
    expect(await titles()).toEqual({ 'SCR-1': 'moved', 'SCR-2': 'SCR-2' })
    expect(await pending()).toEqual([])
  })

  it('finishes the half that did not land, and leaves the half that did', async () => {
    await saveWorkItem(root, item('SCR-1'), NEW_ENTITY)
    await crashAfterJournalling()
    // Simulate the first write having succeeded before the crash.
    await writeFile(
      fileOf('SCR-1'),
      `${JSON.stringify(encodeWorkItem(renamed('SCR-1', 'moved')), null, 2)}\n`,
      'utf8',
    )

    const recovered = await recoverOperations(layout)

    expect(recovered[0]?.files).toEqual([fileOf('SCR-2')])
    expect(await titles()).toEqual({ 'SCR-1': 'moved', 'SCR-2': 'SCR-2' })
  })

  // Recovery runs on every open, so it has to be safe to run when there is
  // nothing to do and safe to run twice over the same journal.
  it('changes nothing when run again', async () => {
    await saveWorkItem(root, item('SCR-1'), NEW_ENTITY)
    await crashAfterJournalling()

    await recoverOperations(layout)
    const before = await titles()
    const second = await recoverOperations(layout)

    expect(second).toEqual([])
    expect(await titles()).toEqual(before)
  })

  it('does nothing at all when no operation was pending', async () => {
    expect(await recoverOperations(layout)).toEqual([])
    expect(await recoverOperations(workspaceLayout(join(root, 'elsewhere')))).toEqual([])
  })

  it('refuses a journal written by another version rather than guessing', async () => {
    await writeFile(
      join(layout.pendingOperations, 'op-future.json'),
      JSON.stringify({ schemaVersion: 9, id: 'op-future', kind: 'unknown', entries: [] }),
      'utf8',
    )

    const error = await caughtFrom(() => recoverOperations(layout))

    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
    expect(await pending()).toEqual(['op-future.json'])
  })
})
