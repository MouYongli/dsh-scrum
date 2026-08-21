import { describe, expect, it } from 'vitest'
import {
  decodeProjectConfig,
  decodeProjectFile,
  decodeSprint,
  decodeWorkItem,
  decodingFile,
  encodeProjectConfig,
  encodeProjectFile,
  encodeSprint,
  encodeWorkItem,
} from '@dsh-scrum/adapter-storage-workspace-files'
import {
  EDITION,
  ERROR_CODE,
  WORK_ITEM_TYPE,
  assignWorkItemToSprint,
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
  type ErrorCode,
  type IdGenerator,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const ids: IdGenerator = { nextUlid: () => ULID }
const OWNER = toIdentityId(`idt_${ULID}`)
const T1 = toTimestamp('2026-08-20T10:00:00Z')
const T2 = toTimestamp('2026-08-20T11:00:00Z')

const project = createProject({
  ids,
  tenantId: toTenantId(`tnt_${ULID}`),
  key: toProjectKey('SCR'),
  name: 'shop-service',
  description: '优惠券结算',
  createdBy: OWNER,
  now: T1,
})
const config = createDefaultProjectConfig(project.id, T1)
const workItem = assignWorkItemToSprint(
  createWorkItem({
    id: toWorkItemId('SCR-12'),
    projectId: project.id,
    type: WORK_ITEM_TYPE.story,
    title: '用户使用优惠券',
    reporterId: OWNER,
    rank: rankBetween(null, null),
    now: T1,
  }),
  toSprintId('sprint-1'),
  T2,
)
const sprint = createSprint({
  id: toSprintId('sprint-1'),
  projectId: project.id,
  name: 'Sprint 1',
  startDate: toTimestamp('2026-09-01T00:00:00Z'),
  endDate: toTimestamp('2026-09-15T00:00:00Z'),
  createdBy: OWNER,
  now: T1,
})

/** What a file holds: the encoder's output after a trip through JSON. */
function stored(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function caughtFrom(run: () => unknown): unknown {
  try {
    run()
    return undefined
  } catch (error) {
    return error
  }
}

function expectRejects(
  run: () => unknown,
  what: string,
  code: ErrorCode = ERROR_CODE.validation,
): void {
  const error = caughtFrom(run)
  expect(isScrumError(error) && error.code, `expected ${what} to be rejected`).toBe(code)
}

describe('round trips', () => {
  it('returns every entity unchanged through encode, JSON and decode', () => {
    const projectFile = { project, edition: EDITION.community }

    expect(decodeProjectFile(stored(encodeProjectFile(projectFile)))).toEqual(projectFile)
    expect(decodeProjectConfig(stored(encodeProjectConfig(config)))).toEqual(config)
    expect(decodeWorkItem(stored(encodeWorkItem(workItem)))).toEqual(workItem)
    expect(decodeSprint(stored(encodeSprint(sprint)))).toEqual(sprint)
  })

  it('stores the project identifier as projectId and reads it back as id', () => {
    const encoded = stored(encodeProjectFile({ project, edition: EDITION.community }))

    expect(encoded['projectId']).toBe(project.id)
    expect('id' in encoded).toBe(false)
    expect(decodeProjectFile(encoded).project.id).toBe(project.id)
  })
})

describe('rejecting a file this build cannot read', () => {
  it('refuses a newer schema version with its own code, before any other field', () => {
    const encoded = stored(encodeWorkItem(workItem))

    expectRejects(
      () => decodeWorkItem({ ...encoded, schemaVersion: 2, title: 41 }),
      'a newer schema version',
      ERROR_CODE.unsupportedSchemaVersion,
    )
  })

  it('refuses a field of the wrong JSON type', () => {
    const encoded = stored(encodeWorkItem(workItem))

    expectRejects(() => decodeWorkItem({ ...encoded, title: 41 }), 'a numeric title')
    expectRejects(() => decodeWorkItem({ ...encoded, labels: 'payments' }), 'labels as a string')
    expectRejects(() => decodeWorkItem({ ...encoded, dependsOn: [1] }), 'a numeric dependency')
    expectRejects(() => decodeWorkItem([]), 'an array where an object belongs')
  })

  // A partial write can leave a file short of a field. Reading that as an
  // explicit null would turn lost data into a deliberate absence.
  it('refuses a missing nullable field but accepts an explicit null', () => {
    const encoded = stored(encodeWorkItem(workItem))
    const missing = { ...encoded }
    delete missing['assigneeId']

    expectRejects(() => decodeWorkItem(missing), 'an absent assignee')
    expect(decodeWorkItem({ ...encoded, assigneeId: null }).assigneeId).toBeNull()
  })

  it('refuses a value the domain would never have produced', () => {
    const encoded = stored(encodeWorkItem(workItem))

    expectRejects(
      () => decodeWorkItem({ ...encoded, status: 'in-progress' }),
      'a hyphenated status',
    )
    expectRejects(() => decodeWorkItem({ ...encoded, id: 'scr-12' }), 'a lowercase identifier')
    expectRejects(() => decodeWorkItem({ ...encoded, rank: '0|hzzzzz:' }), 'a lexorank value')
    expectRejects(
      () =>
        decodeProjectFile({
          ...stored(encodeProjectFile({ project, edition: EDITION.community })),
          edition: 'pro',
        }),
      'an unknown edition',
    )
  })

  it('refuses a permission policy that reaches beyond the configurable cells', () => {
    const encoded = stored(encodeProjectConfig(config))

    expectRejects(
      () =>
        decodeProjectConfig({ ...encoded, permissionPolicy: { 'project.archive': ['developer'] } }),
      'a policy on a cell the matrix fixes',
    )
  })
})

describe('naming the file a failure came from', () => {
  it('attaches the path and keeps the schema code distinct from a corrupt file', () => {
    const corrupt = caughtFrom(() =>
      decodingFile('/w/.scrum/work-items/SCR-1.json', () => decodeWorkItem({})),
    )
    const newer = caughtFrom(() =>
      decodingFile('/w/.scrum/work-items/SCR-2.json', () =>
        decodeWorkItem({ ...stored(encodeWorkItem(workItem)), schemaVersion: 9 }),
      ),
    )

    expect(isScrumError(corrupt) && corrupt.code).toBe(ERROR_CODE.validation)
    expect(isScrumError(corrupt) && corrupt.details['file']).toBe('/w/.scrum/work-items/SCR-1.json')
    expect(isScrumError(newer) && newer.code).toBe(ERROR_CODE.unsupportedSchemaVersion)
    expect(isScrumError(newer) && newer.details['file']).toBe('/w/.scrum/work-items/SCR-2.json')
    expect(isScrumError(newer) && newer.details['foundVersion']).toBe(9)
  })

  it('lets a failure that is not a domain error through untouched', () => {
    const thrown = new TypeError('something else entirely')

    expect(
      caughtFrom(() =>
        decodingFile('/w/.scrum/project.json', () => {
          throw thrown
        }),
      ),
    ).toBe(thrown)
  })
})
