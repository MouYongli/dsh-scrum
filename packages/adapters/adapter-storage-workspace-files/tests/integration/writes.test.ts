import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  NEW_ENTITY,
  initialiseProject,
  saveProject,
  saveProjectConfig,
  saveSprint,
  saveWorkItem,
  scanWorkspace,
  workItemFile,
  workspaceLayout,
} from '@dsh-scrum/adapter-storage-workspace-files'
import {
  EDITION,
  ERROR_CODE,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  archiveProject,
  assignWorkItemToSprint,
  createDefaultProjectConfig,
  createProject,
  createSprint,
  createWorkItem,
  isScrumError,
  moveWorkItemStatus,
  rankBetween,
  startSprint,
  toIdentityId,
  toProjectId,
  toProjectKey,
  toRevision,
  toSprintId,
  toTenantId,
  toTimestamp,
  toWorkItemId,
  updateProjectConfig,
  updateWorkItemDetails,
  type IdGenerator,
  type Sprint,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const OTHER_ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABW'
const ids: IdGenerator = { nextUlid: () => ULID }
const OWNER = toIdentityId(`idt_${ULID}`)
const T1 = toTimestamp('2026-08-20T10:00:00Z')
const T2 = toTimestamp('2026-08-20T11:00:00Z')
const T3 = toTimestamp('2026-08-20T12:00:00Z')

let root: string

const project = createProject({
  ids,
  tenantId: toTenantId(`tnt_${ULID}`),
  key: toProjectKey('SCR'),
  name: 'shop-service',
  createdBy: OWNER,
  now: T1,
})

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-scrum-writes-'))
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

function item(key = 'SCR-1'): WorkItem {
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

function sprintOf(id: string): Sprint {
  return createSprint({
    id: toSprintId(id),
    projectId: project.id,
    name: id,
    startDate: toTimestamp('2026-09-01T00:00:00Z'),
    endDate: toTimestamp('2026-09-15T00:00:00Z'),
    createdBy: OWNER,
    now: T1,
  })
}

async function caughtFrom(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
    return undefined
  } catch (error) {
    return error
  }
}

describe('creating an entity', () => {
  it('writes it and reads it back through a scan', async () => {
    await saveWorkItem(root, item(), NEW_ENTITY)

    const snapshot = await scanWorkspace(root)
    expect(snapshot.workItems.get(toWorkItemId('SCR-1'))).toEqual(item())
  })

  it('refuses to create over something already there', async () => {
    await saveWorkItem(root, item(), NEW_ENTITY)
    const error = await caughtFrom(() => saveWorkItem(root, item(), NEW_ENTITY))

    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.conflict)
  })

  it('refuses a new entity that does not start at the initial revision', async () => {
    const advanced = updateWorkItemDetails(item(), { title: 'later' }, T2)
    const error = await caughtFrom(() => saveWorkItem(root, advanced, NEW_ENTITY))

    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
  })
})

describe('replacing an entity', () => {
  it('accepts a write from the revision on disk', async () => {
    await saveWorkItem(root, item(), NEW_ENTITY)
    const edited = updateWorkItemDetails(item(), { title: 'renamed' }, T2)
    await saveWorkItem(root, edited, item().revision)

    const snapshot = await scanWorkspace(root)
    expect(snapshot.workItems.get(toWorkItemId('SCR-1'))?.title).toBe('renamed')
    expect(snapshot.workItems.get(toWorkItemId('SCR-1'))?.revision).toBe(2)
  })

  // The lost update. Two callers read revision 1, both edit, and without the
  // check the second silently discards the first's change.
  it('refuses a write whose expected revision is behind, and changes nothing', async () => {
    await saveWorkItem(root, item(), NEW_ENTITY)
    const first = updateWorkItemDetails(item(), { title: 'first' }, T2)
    const second = updateWorkItemDetails(item(), { title: 'second' }, T2)

    await saveWorkItem(root, first, item().revision)
    const error = await caughtFrom(() => saveWorkItem(root, second, item().revision))

    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.conflict)
    expect(isScrumError(error) && error.details['expectedRevision']).toBe(1)
    expect(isScrumError(error) && error.details['actualRevision']).toBe(2)
    expect((await scanWorkspace(root)).workItems.get(toWorkItemId('SCR-1'))?.title).toBe('first')
  })

  it('refuses a write that does not advance the revision by one', async () => {
    await saveWorkItem(root, item(), NEW_ENTITY)
    const twice = updateWorkItemDetails(updateWorkItemDetails(item(), {}, T2), {}, T3)

    const error = await caughtFrom(() => saveWorkItem(root, twice, item().revision))
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
  })

  it('refuses to replace an entity that is no longer there', async () => {
    const error = await caughtFrom(() =>
      saveWorkItem(root, updateWorkItemDetails(item(), {}, T2), item().revision),
    )

    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.conflict)
  })

  it('refuses to overwrite a file written by a newer build', async () => {
    await saveWorkItem(root, item(), NEW_ENTITY)
    const layout = workspaceLayout(root)
    const file = workItemFile(layout, toWorkItemId('SCR-1'))
    const raw = JSON.parse(await readFile(file, 'utf8')) as object
    await writeFile(file, JSON.stringify({ ...raw, schemaVersion: 9 }), 'utf8')

    const error = await caughtFrom(() =>
      saveWorkItem(root, updateWorkItemDetails(item(), {}, T2), item().revision),
    )
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.unsupportedSchemaVersion)
  })

  // A file broken in some other field still has to be repairable by writing
  // over it, or the only way out is to disable the check that protects it.
  it('still honours the revision of a file corrupt in another field', async () => {
    await saveWorkItem(root, item(), NEW_ENTITY)
    const file = workItemFile(workspaceLayout(root), toWorkItemId('SCR-1'))
    const raw = JSON.parse(await readFile(file, 'utf8')) as object
    await writeFile(file, JSON.stringify({ ...raw, title: 12345 }), 'utf8')

    await saveWorkItem(
      root,
      updateWorkItemDetails(item(), { title: 'repaired' }, T2),
      toRevision(1),
    )
    expect((await scanWorkspace(root)).workItems.get(toWorkItemId('SCR-1'))?.title).toBe('repaired')
  })
})

describe('two hosts racing on the same file', () => {
  it('lets exactly one of two writes from the same read succeed', async () => {
    await saveWorkItem(root, item(), NEW_ENTITY)
    const first = updateWorkItemDetails(item(), { title: 'first' }, T2)
    const second = updateWorkItemDetails(item(), { title: 'second' }, T2)

    const outcomes = await Promise.allSettled([
      saveWorkItem(root, first, item().revision),
      saveWorkItem(root, second, item().revision),
    ])

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    const stored = (await scanWorkspace(root)).workItems.get(toWorkItemId('SCR-1'))
    expect(['first', 'second']).toContain(stored?.title)
    expect(stored?.revision).toBe(2)
  })

  it('leaves no temporary file behind after a race', async () => {
    await saveWorkItem(root, item(), NEW_ENTITY)
    await Promise.allSettled([
      saveWorkItem(root, updateWorkItemDetails(item(), { title: 'a' }, T2), toRevision(1)),
      saveWorkItem(root, updateWorkItemDetails(item(), { title: 'b' }, T2), toRevision(1)),
    ])

    expect(await readdir(workspaceLayout(root).workItems)).toEqual(['SCR-1.json'])
  })
})

describe('constraints checked before the write', () => {
  it('refuses an entity that belongs to another project', async () => {
    const foreign = { ...item(), projectId: toProjectId(`prj_${OTHER_ULID}`) }

    const error = await caughtFrom(() => saveWorkItem(root, foreign, NEW_ENTITY))
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
    expect((await scanWorkspace(root)).workItems.size).toBe(0)
  })

  it('refuses a second active sprint, and allows the first', async () => {
    const first = sprintOf('sprint-1')
    const second = sprintOf('sprint-2')
    await saveSprint(root, first, NEW_ENTITY)
    await saveSprint(root, second, NEW_ENTITY)

    const started = startSprint(first, [first, second], T2)
    await saveSprint(root, started, first.revision)

    const error = await caughtFrom(() =>
      saveSprint(root, startSprint(second, [second], T2), toRevision(1)),
    )
    expect(isScrumError(error) && error.details['activeSprintId']).toBe(first.id)
  })

  it('lets an already active sprint be written again', async () => {
    const sprint = sprintOf('sprint-1')
    await saveSprint(root, sprint, NEW_ENTITY)
    const started = startSprint(sprint, [sprint], T2)
    await saveSprint(root, started, toRevision(1))

    await saveSprint(
      root,
      { ...started, revision: toRevision(3), updatedAt: T3, goal: '交付' },
      toRevision(2),
    )
    expect((await scanWorkspace(root)).sprints.get(toSprintId('sprint-1'))?.goal).toBe('交付')
  })

  it('refuses every entity write once the project is archived', async () => {
    await saveProject(
      root,
      { project: archiveProject(project, T2), edition: EDITION.community },
      toRevision(1),
    )

    const error = await caughtFrom(() => saveWorkItem(root, item(), NEW_ENTITY))
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
  })

  it('still lets the project itself be written while archived, so it can be restored', async () => {
    const archived = archiveProject(project, T2)
    await saveProject(root, { project: archived, edition: EDITION.community }, toRevision(1))

    const restored = { ...project, revision: toRevision(3), updatedAt: T3 }
    await saveProject(root, { project: restored, edition: EDITION.community }, toRevision(2))
    expect((await scanWorkspace(root)).project.status).toBe('active')
  })
})

describe('writing the project configuration', () => {
  it('replaces it under the same revision rules', async () => {
    const config = createDefaultProjectConfig(project.id, T1)
    const updated = updateProjectConfig(config, { sprintLengthInDays: 7 }, T2)

    await saveProjectConfig(root, updated, config.revision)
    expect((await scanWorkspace(root)).config.sprintLengthInDays).toBe(7)

    const error = await caughtFrom(() => saveProjectConfig(root, updated, config.revision))
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.conflict)
  })
})

describe('a work item moving through a sprint', () => {
  it('keeps the board state consistent across writes', async () => {
    const sprint = sprintOf('sprint-1')
    await saveSprint(root, sprint, NEW_ENTITY)
    await saveWorkItem(root, item(), NEW_ENTITY)

    const planned = assignWorkItemToSprint(item(), sprint.id, T2)
    await saveWorkItem(root, planned, toRevision(1))
    const started = moveWorkItemStatus(planned, WORK_ITEM_STATUS.inProgress, T3)
    await saveWorkItem(root, started, toRevision(2))

    const stored = (await scanWorkspace(root)).workItems.get(toWorkItemId('SCR-1'))
    expect(stored?.status).toBe(WORK_ITEM_STATUS.inProgress)
    expect(stored?.sprintId).toBe(sprint.id)
    expect(stored?.revision).toBe(3)
  })
})
