import { describe, expect, it } from 'vitest'
import {
  CAPABILITY,
  EDITION,
  ESTIMATION_METHOD,
  MEMBER_STATUS,
  PERMISSION,
  PERMISSIONS,
  PROJECT_ROLE,
  PROJECT_STATUS,
  WORK_ITEM_STATUS,
  assertSupportedSchemaVersion,
  createDefaultProjectConfig,
  createProject,
  toEdition,
  toIdentityId,
  toProjectId,
  toProjectKey,
  toProjectStatus,
  toRevision,
  toTenantId,
  toTimestamp,
  type IdGenerator,
  type Project,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const ids: IdGenerator = { nextUlid: () => ULID }
const CREATED = toTimestamp('2026-08-20T10:00:00Z')

/**
 * The read path a storage adapter performs. It stands in for
 * `adapter-storage-workspace-files`, which does not exist yet: pinning the
 * mapping here means that adapter has a contract to satisfy rather than a
 * shape to invent.
 */
function parseProject(raw: Record<string, unknown>): Project {
  return {
    schemaVersion: assertSupportedSchemaVersion(raw['schemaVersion'] as number),
    revision: toRevision(raw['revision'] as number),
    createdAt: toTimestamp(raw['createdAt'] as string),
    updatedAt: toTimestamp(raw['updatedAt'] as string),
    id: toProjectId(raw['projectId'] as string),
    tenantId: toTenantId(raw['tenantId'] as string),
    key: toProjectKey(raw['key'] as string),
    name: raw['name'] as string,
    description: raw['description'] as string,
    status: toProjectStatus(raw['status'] as string),
    createdBy: toIdentityId(raw['createdBy'] as string),
  }
}

function serializeProject(project: Project): Record<string, unknown> {
  const { id, ...rest } = project
  return JSON.parse(JSON.stringify({ ...rest, projectId: id })) as Record<string, unknown>
}

function project(): Project {
  return createProject({
    ids,
    tenantId: toTenantId(`tnt_${ULID}`),
    key: toProjectKey('SCR'),
    name: 'shop-service',
    createdBy: toIdentityId(`idt_${ULID}`),
    now: CREATED,
  })
}

// Field names and value spellings here are the persisted format described in
// docs/development/architecture.md section 10.2. Changing any of them is a
// storage format change and needs a schema version bump plus a migration.
describe('project persistence contract', () => {
  it('stores the entity under the documented field names', () => {
    expect(serializeProject(project())).toEqual({
      schemaVersion: 1,
      projectId: `prj_${ULID}`,
      tenantId: `tnt_${ULID}`,
      key: 'SCR',
      name: 'shop-service',
      description: '',
      status: 'active',
      createdBy: `idt_${ULID}`,
      revision: 1,
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-20T10:00:00.000Z',
    })
  })

  // The one place a primary key is not spelled `id`. Both directions are
  // asserted so the two names cannot drift apart in one of them.
  it('maps the entity id to and from the stored projectId', () => {
    const stored = serializeProject(project())

    expect(stored['projectId']).toBe(project().id)
    expect(parseProject(stored)).toEqual(project())
    expect(parseProject(stored).id).toBe(stored['projectId'])
  })

  it('reads the sample from the architecture document', () => {
    const sample = {
      schemaVersion: 1,
      projectId: `prj_${ULID}`,
      tenantId: `tnt_${ULID}`,
      edition: 'community',
      key: 'SCR',
      name: 'shop-service',
      description: '',
      status: 'active',
      createdBy: `idt_${ULID}`,
      revision: 1,
      createdAt: '2026-08-20T10:00:00Z',
      updatedAt: '2026-08-20T10:00:00Z',
    }

    expect(parseProject(sample).key).toBe('SCR')
    expect(toEdition(sample.edition)).toBe(EDITION.community)
  })

  // The storage rules forbid a credential in `.scrum/`. Pinning the whole key
  // set means adding a field that could hold one fails here first.
  it('stores project configuration under a fixed set of fields', () => {
    const config = createDefaultProjectConfig(toProjectId(`prj_${ULID}`), CREATED)

    expect(Object.keys(JSON.parse(JSON.stringify(config)) as object).sort()).toEqual(
      [
        'createdAt',
        'definitionOfDone',
        'estimationMethod',
        'permissionPolicy',
        'projectId',
        'revision',
        'schemaVersion',
        'sprintLengthInDays',
        'statusDisplayNames',
        'statuses',
        'updatedAt',
        'workInProgressLimit',
      ].sort(),
    )
  })
})

// These strings leave the package. They are stored in `.scrum/` files, named by
// the API contract's principal and error payloads, and keyed on by the UI, so
// they may be added to but never renamed.
describe('published string surfaces', () => {
  it('pins the values stored in files', () => {
    expect(Object.values(PROJECT_STATUS)).toEqual(['active', 'archived'])
    expect(Object.values(MEMBER_STATUS)).toEqual(['active', 'suspended'])
    expect(Object.values(EDITION)).toEqual(['community', 'teams', 'enterprise'])
    expect(Object.values(WORK_ITEM_STATUS)).toEqual([
      'backlog',
      'todo',
      'in_progress',
      'review',
      'done',
    ])
    expect(Object.values(ESTIMATION_METHOD)).toEqual(['story_points', 'hours', 'count'])
    expect(Object.values(PROJECT_ROLE)).toEqual([
      'product_owner',
      'scrum_master',
      'developer',
      'stakeholder',
      'administrator',
    ])
  })

  it('pins the values a remote handshake reports', () => {
    expect(Object.values(CAPABILITY)).toEqual([
      'scrum.core',
      'collaboration',
      'rbac',
      'audit.basic',
      'audit.advanced',
      'sso',
      'scim',
      'selfHosted',
    ])
    expect([...PERMISSIONS]).toEqual([
      'project.view',
      'backlog.view',
      'workItem.write',
      'backlog.prioritize',
      'workItem.estimate',
      'workItem.setAcceptanceCriteria',
      'sprint.create',
      'sprint.setGoal',
      'sprint.assignWorkItems',
      'sprint.transition',
      'workItem.updateOwnStatus',
      'workItem.updateAnyStatus',
      'workItem.setBlocked',
      'workItem.accept',
      'retrospective.manage',
      'report.view',
      'member.manage',
      'project.configure',
      'project.archive',
      'workItem.suggest',
    ])
    expect(PERMISSION.memberManage).toBe('member.manage')
  })
})
