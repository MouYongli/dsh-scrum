import { describe, expect, it } from 'vitest'
import {
  CAPABILITY,
  EDITION,
  ERROR_CODE,
  ID_PREFIX,
  MEMBER_STATUS,
  PROJECT_ROLE,
  PROJECT_ROLES,
  PROJECT_STATUS,
  createOwnerMember,
  createProjectMember,
  isScrumError,
  memberRoles,
  newMemberId,
  setMemberRoles,
  setMemberStatus,
  toCapability,
  toEdition,
  toMemberId,
  toMemberStatus,
  toProjectId,
  toProjectRole,
  toProjectRoles,
  toProjectStatus,
  toIdentityId,
  toTimestamp,
  type IdGenerator,
  type ProjectMember,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const ids: IdGenerator = { nextUlid: () => ULID }
const NOW = toTimestamp('2026-08-20T10:00:00Z')
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

function member(roles: readonly (typeof PROJECT_ROLE)[keyof typeof PROJECT_ROLE][]): ProjectMember {
  return createProjectMember({
    ids,
    projectId: toProjectId(`prj_${ULID}`),
    identityId: toIdentityId(`idt_${ULID}`),
    roles,
    now: NOW,
  })
}

describe('project membership', () => {
  it('starts active at the initial revision', () => {
    const created = member([PROJECT_ROLE.developer])

    expect(created.id).toBe(`${ID_PREFIX.member}_${ULID}`)
    expect(created.status).toBe(MEMBER_STATUS.active)
    expect(created.revision).toBe(1)
    expect(memberRoles(created)).toEqual([PROJECT_ROLE.developer])
  })

  it('gives the project owner every role', () => {
    const owner = createOwnerMember({
      ids,
      projectId: toProjectId(`prj_${ULID}`),
      identityId: toIdentityId(`idt_${ULID}`),
      now: NOW,
    })

    expect(owner.roles).toEqual(PROJECT_ROLES)
  })

  it('replaces roles and advances the revision', () => {
    const changed = setMemberRoles(
      member([PROJECT_ROLE.developer]),
      [PROJECT_ROLE.scrumMaster, PROJECT_ROLE.developer],
      LATER,
    )

    expect(changed.roles).toEqual([PROJECT_ROLE.scrumMaster, PROJECT_ROLE.developer])
    expect(changed.revision).toBe(2)
    expectRejects(() => setMemberRoles(changed, [], LATEST), 'a member left with no role')
  })

  it('suspends and reinstates, refusing a status the member already holds', () => {
    const suspended = setMemberStatus(
      member([PROJECT_ROLE.developer]),
      MEMBER_STATUS.suspended,
      LATER,
    )
    const reinstated = setMemberStatus(suspended, MEMBER_STATUS.active, LATEST)

    expect(memberRoles(suspended)).toEqual([])
    expect(memberRoles(reinstated)).toEqual([PROJECT_ROLE.developer])
    expectRejects(
      () => setMemberStatus(suspended, MEMBER_STATUS.suspended, LATEST),
      'suspending a suspended member',
    )
  })

  it('collapses duplicate roles into the matrix order', () => {
    expect(
      toProjectRoles([PROJECT_ROLE.developer, PROJECT_ROLE.productOwner, PROJECT_ROLE.developer]),
    ).toEqual([PROJECT_ROLE.productOwner, PROJECT_ROLE.developer])
  })
})

// Every constructor that turns a stored string back into a domain value. An
// untested one is a validation rule that can be weakened without anything
// noticing, which is how malformed data reaches an aggregate.
describe('value constructors', () => {
  it('round trips a member identifier', () => {
    expect(toMemberId(newMemberId(ids))).toBe(`${ID_PREFIX.member}_${ULID}`)
    expectRejects(() => toMemberId(`prj_${ULID}`), 'a project id as a member id')
  })

  it('accepts the published spellings and refuses anything else', () => {
    expect(toMemberStatus('suspended')).toBe(MEMBER_STATUS.suspended)
    expect(toProjectStatus('archived')).toBe(PROJECT_STATUS.archived)
    expect(toEdition('enterprise')).toBe(EDITION.enterprise)
    expect(toCapability('audit.basic')).toBe(CAPABILITY.auditBasic)
    expect(toProjectRole('scrum_master')).toBe(PROJECT_ROLE.scrumMaster)

    expectRejects(() => toMemberStatus('removed'), 'an unknown member status')
    expectRejects(() => toProjectStatus('deleted'), 'an unknown project status')
    expectRejects(() => toEdition('pro'), 'an unknown edition')
    expectRejects(() => toCapability('audit'), 'an unknown capability')
    expectRejects(() => toProjectRole('owner'), 'an unknown role')
  })
})
