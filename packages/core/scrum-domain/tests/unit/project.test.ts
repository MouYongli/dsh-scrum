import { describe, expect, it } from 'vitest'
import {
  EDITION,
  ERROR_CODE,
  PROJECT_STATUS,
  archiveProject,
  assertProjectWritable,
  createProject,
  createTenant,
  isProjectWritable,
  isScrumError,
  renameTenant,
  restoreProject,
  toIdentityId,
  toProjectKey,
  toTenantId,
  toTimestamp,
  updateProjectDetails,
  type IdGenerator,
  type Project,
} from '@dsh-scrum/scrum-domain'

const ULIDS = [
  '01K5TFQ8Z4N7C2M9XPRWD3HABV',
  '01K5TFQ8Z4N7C2M9XPRWD3HABW',
  '01K5TFQ8Z4N7C2M9XPRWD3HABX',
]

function generator(): IdGenerator {
  let index = 0
  return {
    nextUlid(): string {
      const ulid = ULIDS[index % ULIDS.length]
      index += 1
      return ulid as string
    },
  }
}

const TENANT = toTenantId(`tnt_${ULIDS[0] as string}`)
const OWNER = toIdentityId(`idt_${ULIDS[0] as string}`)
const CREATED = toTimestamp('2026-08-20T10:00:00Z')
const LATER = toTimestamp('2026-08-20T12:00:00Z')
const LATEST = toTimestamp('2026-08-20T14:00:00Z')

function caughtFrom(run: () => unknown): unknown {
  try {
    run()
    return undefined
  } catch (error) {
    return error
  }
}

function expectRejects(run: () => unknown, what: string): void {
  const error = caughtFrom(run)
  expect(isScrumError(error) && error.code, `expected ${what} to be rejected`).toBe(
    ERROR_CODE.validation,
  )
}

function project(): Project {
  return createProject({
    ids: generator(),
    tenantId: TENANT,
    key: toProjectKey('SCR'),
    name: '  shop-service  ',
    createdBy: OWNER,
    now: CREATED,
  })
}

describe('project creation', () => {
  it('starts active at the initial revision, with the name trimmed', () => {
    const created = project()

    expect(created.status).toBe(PROJECT_STATUS.active)
    expect(created.revision).toBe(1)
    expect(created.name).toBe('shop-service')
    expect(created.description).toBe('')
    expect(created.createdAt).toBe(CREATED)
    expect(created.updatedAt).toBe(CREATED)
    expect(isProjectWritable(created)).toBe(true)
  })

  it('rejects an empty or over long name', () => {
    const base = {
      ids: generator(),
      tenantId: TENANT,
      key: toProjectKey('SCR'),
      createdBy: OWNER,
      now: CREATED,
    }

    expectRejects(() => createProject({ ...base, name: '   ' }), 'a blank name')
    expectRejects(() => createProject({ ...base, name: 'a'.repeat(121) }), 'an over long name')
    expectRejects(() => createProject({ ...base, name: 'shop\nservice' }), 'a name with a newline')
  })
})

describe('project archiving', () => {
  it('advances the revision and preserves every creation fact', () => {
    const created = project()
    const archived = archiveProject(created, LATER)
    const restored = restoreProject(archived, LATEST)

    expect(archived.status).toBe(PROJECT_STATUS.archived)
    expect(archived.revision).toBe(2)
    expect(archived.updatedAt).toBe(LATER)
    expect(restored.status).toBe(PROJECT_STATUS.active)
    expect(restored.revision).toBe(3)

    for (const field of [
      'id',
      'tenantId',
      'key',
      'createdBy',
      'createdAt',
      'schemaVersion',
    ] as const) {
      expect(archived[field]).toBe(created[field])
      expect(restored[field]).toBe(created[field])
    }
  })

  it('refuses a transition the project is already in', () => {
    const archived = archiveProject(project(), LATER)

    expectRejects(() => archiveProject(archived, LATEST), 'archiving an archived project')
    expectRejects(() => restoreProject(project(), LATER), 'restoring an active project')
  })

  it('refuses writes while archived but still allows restoring', () => {
    const archived = archiveProject(project(), LATER)

    expectRejects(() => assertProjectWritable(archived), 'a write to an archived project')
    expectRejects(
      () => updateProjectDetails(archived, { name: 'renamed' }, LATEST),
      'renaming an archived project',
    )
    expect(restoreProject(archived, LATEST).status).toBe(PROJECT_STATUS.active)
  })

  it('refuses a transition stamped earlier than the stored update time', () => {
    const archived = archiveProject(project(), LATER)

    expectRejects(() => restoreProject(archived, CREATED), 'a transition with a rolled back clock')
  })
})

describe('project detail updates', () => {
  it('changes only the fields it is given', () => {
    const created = project()
    const renamed = updateProjectDetails(created, { name: 'renamed' }, LATER)
    const described = updateProjectDetails(renamed, { description: 'a shop' }, LATEST)

    expect(renamed.description).toBe('')
    expect(described.name).toBe('renamed')
    expect(described.description).toBe('a shop')
    expect(described.revision).toBe(3)
  })

  it('accepts an empty description as the stored spelling of absent', () => {
    const described = updateProjectDetails(project(), { description: '   ' }, LATER)

    expect(described.description).toBe('')
  })
})

describe('tenant', () => {
  it('creates and renames while advancing the revision', () => {
    const tenant = createTenant({
      ids: generator(),
      edition: EDITION.community,
      name: 'personal',
      ownerIdentityId: OWNER,
      now: CREATED,
    })
    const renamed = renameTenant(tenant, 'work', LATER)

    expect(tenant.edition).toBe(EDITION.community)
    expect(tenant.ownerIdentityId).toBe(OWNER)
    expect(renamed.name).toBe('work')
    expect(renamed.revision).toBe(2)
    expect(renamed.id).toBe(tenant.id)
    expectRejects(() => renameTenant(tenant, '', LATER), 'a blank tenant name')
  })
})
