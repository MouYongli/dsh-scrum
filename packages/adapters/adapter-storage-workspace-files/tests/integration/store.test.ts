import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  initialiseProject,
  isProjectInitialised,
  readProjectFile,
  scanWorkspace,
  workspaceLayout,
  encodeWorkItem,
  encodeSprint,
} from '@dsh-scrum/adapter-storage-workspace-files'
import {
  EDITION,
  ERROR_CODE,
  WORK_ITEM_TYPE,
  createDefaultProjectConfig,
  createProject,
  createSprint,
  createWorkItem,
  isScrumError,
  rankBetween,
  toIdentityId,
  toProjectKey,
  toSprintId,
  toTenantId,
  toTimestamp,
  toWorkItemId,
  type IdGenerator,
  type Sprint,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const ids: IdGenerator = { nextUlid: () => ULID }
const OWNER = toIdentityId(`idt_${ULID}`)
const T1 = toTimestamp('2026-08-20T10:00:00Z')

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-scrum-store-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const project = createProject({
  ids,
  tenantId: toTenantId(`tnt_${ULID}`),
  key: toProjectKey('SCR'),
  name: 'shop-service',
  createdBy: OWNER,
  now: T1,
})

async function initialise(): Promise<void> {
  await initialiseProject({
    workspaceRoot: root,
    project,
    config: createDefaultProjectConfig(project.id, T1),
    edition: EDITION.community,
  })
}

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

async function writeItem(value: WorkItem, fileName = `${value.id}.json`): Promise<void> {
  const layout = workspaceLayout(root)
  await writeFile(join(layout.workItems, fileName), JSON.stringify(encodeWorkItem(value)), 'utf8')
}

async function caughtFrom(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
    return undefined
  } catch (error) {
    return error
  }
}

describe('binding a workspace to a project', () => {
  it('creates the whole layout and reads the project back', async () => {
    expect(await isProjectInitialised(root)).toBe(false)
    await initialise()

    expect(await isProjectInitialised(root)).toBe(true)
    const stored = await readProjectFile(root)
    expect(stored.project).toEqual(project)
    expect(stored.edition).toBe(EDITION.community)

    const layout = workspaceLayout(root)
    for (const directory of [layout.workItems, layout.sprints, layout.pendingOperations]) {
      await expect(readFile(join(directory, 'missing.json'))).rejects.toThrow(/ENOENT/)
    }
  })

  // A check followed by a write leaves a gap. Two windows opening the same
  // fresh workspace both decide it is empty, and the second overwrites a
  // project the first just created.
  it('refuses to bind a workspace that is already bound', async () => {
    await initialise()
    const error = await caughtFrom(initialise)

    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
    expect((await readProjectFile(root)).project).toEqual(project)
  })

  it('reports an unbound workspace as not found rather than empty', async () => {
    const error = await caughtFrom(() => readProjectFile(root))

    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.notFound)
  })
})

describe('scanning the store', () => {
  it('indexes every work item and sprint by identifier', async () => {
    await initialise()
    await writeItem(item('SCR-1'))
    await writeItem(item('SCR-2'))
    const layout = workspaceLayout(root)
    await writeFile(
      join(layout.sprints, 'sprint-1.json'),
      JSON.stringify(encodeSprint(sprintOf('sprint-1'))),
      'utf8',
    )

    const snapshot = await scanWorkspace(root)

    expect([...snapshot.workItems.keys()]).toEqual([toWorkItemId('SCR-1'), toWorkItemId('SCR-2')])
    expect(snapshot.workItems.get(toWorkItemId('SCR-1'))).toEqual(item('SCR-1'))
    expect([...snapshot.sprints.keys()]).toEqual([toSprintId('sprint-1')])
    expect(snapshot.problems).toEqual([])
  })

  it('reads an empty store, and one whose directories were removed', async () => {
    await initialise()
    await rm(workspaceLayout(root).sprints, { recursive: true })

    const snapshot = await scanWorkspace(root)

    expect(snapshot.workItems.size).toBe(0)
    expect(snapshot.sprints.size).toBe(0)
    expect(snapshot.problems).toEqual([])
  })

  // One unreadable file must not make the project unopenable, which is when
  // the user most needs the tool to start, but it must not vanish either.
  it('keeps the readable items and reports the ones it could not read', async () => {
    await initialise()
    await writeItem(item('SCR-1'))
    const layout = workspaceLayout(root)
    await writeFile(join(layout.workItems, 'SCR-2.json'), '{ not json', 'utf8')
    await writeFile(
      join(layout.workItems, 'SCR-3.json'),
      JSON.stringify({ ...encodeWorkItem(item('SCR-3')), schemaVersion: 9 }),
      'utf8',
    )

    const snapshot = await scanWorkspace(root)

    expect([...snapshot.workItems.keys()]).toEqual([toWorkItemId('SCR-1')])
    expect(snapshot.problems.map((problem) => problem.code)).toEqual([
      ERROR_CODE.validation,
      ERROR_CODE.unsupportedSchemaVersion,
    ])
    for (const problem of snapshot.problems) {
      expect(problem.file).toMatch(/work-items\//)
      expect(problem.message).not.toBe('')
    }
  })

  // The name is part of the addressing. An entity read under one name and
  // indexed under another cannot be found again, and the next write would
  // create a second file for the same entity.
  it('reports a file whose name disagrees with the identifier inside it', async () => {
    await initialise()
    await writeItem(item('SCR-1'), 'SCR-7.json')

    const snapshot = await scanWorkspace(root)

    expect(snapshot.workItems.size).toBe(0)
    expect(snapshot.problems).toHaveLength(1)
    expect(snapshot.problems[0]?.file).toMatch(/SCR-7\.json$/)
  })

  it('ignores anything that is not a json file', async () => {
    await initialise()
    await writeItem(item('SCR-1'))
    const layout = workspaceLayout(root)
    await writeFile(join(layout.workItems, 'README.md'), 'notes', 'utf8')
    await mkdir(join(layout.workItems, 'nested'))

    const snapshot = await scanWorkspace(root)

    expect(snapshot.workItems.size).toBe(1)
    expect(snapshot.problems).toEqual([])
  })

  // There is no useful partial answer when the project itself is unreadable,
  // so this one throws rather than joining the problem list.
  it('refuses to scan when the project file itself is corrupt', async () => {
    await initialise()
    await writeFile(workspaceLayout(root).project, '{ not json', 'utf8')

    const error = await caughtFrom(() => scanWorkspace(root))

    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
    expect(isScrumError(error) && error.details['file']).toMatch(/project\.json$/)
  })

  it('refuses to scan a project written by a newer build', async () => {
    await initialise()
    const raw = JSON.parse(await readFile(workspaceLayout(root).project, 'utf8')) as object
    await writeFile(
      workspaceLayout(root).project,
      JSON.stringify({ ...raw, schemaVersion: 9 }),
      'utf8',
    )

    const error = await caughtFrom(() => scanWorkspace(root))

    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.unsupportedSchemaVersion)
  })
})
