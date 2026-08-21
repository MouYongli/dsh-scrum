import { describe, expect, it } from 'vitest'
import {
  CAPABILITY,
  DEFAULT_PERMISSION_POLICY,
  ERROR_CODE,
  MEMBER_STATUS,
  PERMISSION,
  PERMISSIONS,
  PERMISSION_GRANT,
  PROJECT_ROLE,
  PROJECT_ROLES,
  assertPermission,
  createOwnerMember,
  effectivePermissions,
  hasPermission,
  isScrumError,
  memberRoles,
  requiredCapability,
  roleGrant,
  setMemberStatus,
  toPermissionPolicy,
  toProjectId,
  toIdentityId,
  toTimestamp,
  type Capability,
  type IdGenerator,
  type Permission,
  type PermissionContext,
  type PermissionGrant,
  type ProjectPermissionPolicy,
  type ProjectRole,
} from '@dsh-scrum/scrum-domain'

const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
const NOW = toTimestamp('2026-08-20T10:00:00Z')
const LATER = toTimestamp('2026-08-20T12:00:00Z')

const ids: IdGenerator = { nextUlid: () => ULID }

// The permission matrix of docs/product/scrum.md section 3.1, transcribed row
// by row in the document's column order. The source tables in permissions.ts
// are indexed by role instead, so this is their transpose: a slip in either
// form shows up as a mismatch rather than agreeing with itself.
//
//   A  the role can perform the action, which covers the plain check mark and
//      the collaborative wordings 协助, 参与, 促进 and 可选
//   C  可配置
//   -  —, and the stakeholder cells that describe suggesting rather than doing
const COLUMNS: readonly ProjectRole[] = PROJECT_ROLES
const MATRIX: ReadonlyArray<readonly [Permission, string]> = [
  [PERMISSION.projectView, 'AAAAA'],
  [PERMISSION.backlogView, 'AAAAA'],
  [PERMISSION.workItemWrite, 'AAA-A'],
  [PERMISSION.backlogPrioritize, 'AA--A'],
  [PERMISSION.workItemEstimate, 'AAA-C'],
  [PERMISSION.workItemSetAcceptanceCriteria, 'AAA-A'],
  [PERMISSION.sprintCreate, 'AAA-A'],
  [PERMISSION.sprintSetGoal, 'AAA-A'],
  [PERMISSION.sprintAssignWorkItems, 'AAA-A'],
  [PERMISSION.sprintTransition, 'CA--A'],
  [PERMISSION.workItemUpdateOwnStatus, 'AAA-A'],
  [PERMISSION.workItemUpdateAnyStatus, 'CAC-A'],
  [PERMISSION.workItemSetBlocked, 'AAA-A'],
  [PERMISSION.workItemAccept, 'AA--A'],
  [PERMISSION.retrospectiveManage, 'AAA-A'],
  [PERMISSION.reportView, 'AAAAA'],
  [PERMISSION.memberManage, '----A'],
  [PERMISSION.projectConfigure, '-C--A'],
  [PERMISSION.projectArchive, '----A'],
  // Not a row of the document: the action behind the stakeholder cells that
  // read 可提交建议, 可反馈 and 反馈. Anyone may raise a suggestion; a
  // stakeholder is the only role that may do nothing else.
  [PERMISSION.workItemSuggest, 'AAAAA'],
]

const GRANTS: Readonly<Record<string, PermissionGrant>> = {
  A: PERMISSION_GRANT.allowed,
  C: PERMISSION_GRANT.configurable,
  '-': PERMISSION_GRANT.denied,
}

function context(
  roles: readonly ProjectRole[],
  capabilities: readonly Capability[],
  policy: ProjectPermissionPolicy = {},
): PermissionContext {
  return { roles, capabilities: new Set(capabilities), policy }
}

const CORE_ONLY: readonly Capability[] = [CAPABILITY.core]
const CORE_AND_RBAC: readonly Capability[] = [CAPABILITY.core, CAPABILITY.rbac]

function caughtFrom(run: () => unknown): unknown {
  try {
    run()
    return undefined
  } catch (error) {
    return error
  }
}

describe('the role and permission matrix', () => {
  it('matches the product design cell by cell', () => {
    for (const [permission, cells] of MATRIX) {
      COLUMNS.forEach((role, column) => {
        expect(roleGrant(role, permission), `${permission} for ${role}`).toBe(
          GRANTS[cells[column] as string],
        )
      })
    }
  })

  it('decides every published permission exactly once', () => {
    expect(MATRIX.map(([permission]) => permission)).toEqual([...PERMISSIONS])
  })

  it('gives a multi-role member the strongest grant any role carries', () => {
    const both = context([PROJECT_ROLE.developer, PROJECT_ROLE.administrator], CORE_AND_RBAC)

    expect(hasPermission(both, PERMISSION.memberManage)).toBe(true)
    expect(
      hasPermission(context([PROJECT_ROLE.developer], CORE_AND_RBAC), PERMISSION.memberManage),
    ).toBe(false)
  })
})

describe('the capability gate', () => {
  it('withholds a permission whose capability the edition does not grant', () => {
    const withoutRbac = context([PROJECT_ROLE.administrator], CORE_ONLY)

    expect(requiredCapability(PERMISSION.memberManage)).toBe(CAPABILITY.rbac)
    expect(hasPermission(withoutRbac, PERMISSION.memberManage)).toBe(false)
    expect(hasPermission(withoutRbac, PERMISSION.projectArchive)).toBe(true)
  })

  it('reports the missing capability on the refusal', () => {
    const error = caughtFrom(() =>
      assertPermission(context([PROJECT_ROLE.administrator], CORE_ONLY), PERMISSION.memberManage),
    )

    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.forbidden)
    expect(isScrumError(error) && error.details['requiredCapability']).toBe(CAPABILITY.rbac)
  })

  it('accepts a plain set of capabilities as the port', () => {
    expect(
      hasPermission(context([PROJECT_ROLE.administrator], CORE_AND_RBAC), PERMISSION.memberManage),
    ).toBe(true)
  })
})

describe('the project permission policy', () => {
  it('leaves a configurable cell denied until the project opens it', () => {
    const owner = [PROJECT_ROLE.productOwner]

    expect(hasPermission(context(owner, CORE_ONLY), PERMISSION.sprintTransition)).toBe(false)
    expect(
      hasPermission(
        context(owner, CORE_ONLY, { [PERMISSION.sprintTransition]: owner }),
        PERMISSION.sprintTransition,
      ),
    ).toBe(true)
  })

  it('ships with developers able to advance any card and nothing else opened', () => {
    expect(DEFAULT_PERMISSION_POLICY).toEqual({
      [PERMISSION.workItemUpdateAnyStatus]: [PROJECT_ROLE.developer],
    })
  })

  it('refuses a policy that reaches beyond the configurable cells', () => {
    const reaching = caughtFrom(() =>
      toPermissionPolicy({ [PERMISSION.memberManage]: [PROJECT_ROLE.stakeholder] }),
    )
    const unknownPermission = caughtFrom(() => toPermissionPolicy({ 'project.destroy': [] }))
    const unknownRole = caughtFrom(() =>
      toPermissionPolicy({ [PERMISSION.sprintTransition]: ['owner'] }),
    )

    for (const error of [reaching, unknownPermission, unknownRole]) {
      expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
    }
  })

  it('accepts a well formed policy', () => {
    expect(
      toPermissionPolicy({ [PERMISSION.projectConfigure]: [PROJECT_ROLE.scrumMaster] }),
    ).toEqual({ [PERMISSION.projectConfigure]: [PROJECT_ROLE.scrumMaster] })
  })
})

describe('effective permissions', () => {
  it('gives a community owner everything their edition allows', () => {
    const owner = createOwnerMember({
      ids,
      projectId: toProjectId(`prj_${ULID}`),
      identityId: toIdentityId(`idt_${ULID}`),
      now: NOW,
    })
    const granted = effectivePermissions(
      context(memberRoles(owner), CORE_ONLY, DEFAULT_PERMISSION_POLICY),
    )

    expect([...granted].sort()).toEqual(
      PERMISSIONS.filter((permission) => permission !== PERMISSION.memberManage)
        .map((permission) => permission)
        .sort(),
    )
  })

  it('grants a suspended member nothing, without discarding their roles', () => {
    const owner = createOwnerMember({
      ids,
      projectId: toProjectId(`prj_${ULID}`),
      identityId: toIdentityId(`idt_${ULID}`),
      now: NOW,
    })
    const suspended = setMemberStatus(owner, MEMBER_STATUS.suspended, LATER)

    expect(suspended.roles).toEqual(owner.roles)
    expect(memberRoles(suspended)).toEqual([])
    expect(effectivePermissions(context(memberRoles(suspended), CORE_AND_RBAC)).size).toBe(0)
  })

  it('gives a stakeholder reading and suggesting only', () => {
    const granted = effectivePermissions(context([PROJECT_ROLE.stakeholder], CORE_AND_RBAC))

    expect([...granted].sort()).toEqual(
      [
        PERMISSION.projectView,
        PERMISSION.backlogView,
        PERMISSION.reportView,
        PERMISSION.workItemSuggest,
      ].sort(),
    )
  })
})
