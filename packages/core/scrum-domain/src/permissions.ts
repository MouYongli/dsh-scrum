import { CAPABILITY, type Capability, type CapabilitySet } from './capabilities.js'
import { ForbiddenError, ValidationError } from './errors.js'
import { PROJECT_ROLE, toProjectRoles, type ProjectRole } from './roles.js'

/**
 * Every action the permission matrix decides. The string values cross the
 * process boundary: they are what a remote handshake reports as the current
 * principal's permissions, and what the UI keys its disabled states on. They
 * may be added to but never renamed.
 *
 * Nineteen of them are the rows of the product design's matrix. `workItem.suggest`
 * is the twentieth: three stakeholder cells read "may submit a suggestion" or
 * "may give feedback", which is a different and weaker action rather than a
 * weaker grant of the row's action. Giving it its own permission keeps every
 * cell a clean yes or no, instead of introducing a partial grant level that the
 * storage layer and the API contract would then both have to carry.
 */
export const PERMISSION = {
  projectView: 'project.view',
  backlogView: 'backlog.view',
  workItemWrite: 'workItem.write',
  backlogPrioritize: 'backlog.prioritize',
  workItemEstimate: 'workItem.estimate',
  workItemSetAcceptanceCriteria: 'workItem.setAcceptanceCriteria',
  sprintCreate: 'sprint.create',
  sprintSetGoal: 'sprint.setGoal',
  sprintAssignWorkItems: 'sprint.assignWorkItems',
  sprintTransition: 'sprint.transition',
  workItemUpdateOwnStatus: 'workItem.updateOwnStatus',
  workItemUpdateAnyStatus: 'workItem.updateAnyStatus',
  workItemSetBlocked: 'workItem.setBlocked',
  workItemAccept: 'workItem.accept',
  retrospectiveManage: 'retrospective.manage',
  reportView: 'report.view',
  memberManage: 'member.manage',
  projectConfigure: 'project.configure',
  projectArchive: 'project.archive',
  workItemSuggest: 'workItem.suggest',
} as const

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION]

export const PERMISSIONS: readonly Permission[] = Object.values(PERMISSION)

const PERMISSION_VALUES: readonly string[] = PERMISSIONS

export function toPermission(value: string): Permission {
  if (!PERMISSION_VALUES.includes(value)) {
    throw new ValidationError('Permission is not one of the published permissions', { value })
  }
  return value as Permission
}

/**
 * How strongly a role holds a permission. `configurable` is the matrix's
 * "可配置" cell: the role may hold it, but only if the project says so.
 */
export const PERMISSION_GRANT = {
  allowed: 'allowed',
  configurable: 'configurable',
  denied: 'denied',
} as const

export type PermissionGrant = (typeof PERMISSION_GRANT)[keyof typeof PERMISSION_GRANT]

// The matrix, indexed by role and listing only the cells that are not denied,
// so an unlisted pair fails closed. The test transcribes the same table row by
// row in the product design's column order: the two forms are transposes of
// each other, so a slip in either one cannot hide.
//
// The narrative cells collapse as follows.
//   "协助", "参与", "促进", "可选"  the role can perform the action, so allowed
//   "—"                            denied
//   "可配置"                        configurable
//   stakeholder "可提交建议" / "可反馈" / "反馈"
//                                  denied on the row, allowed on workItem.suggest
//   developer "提交验收"            denied on workItem.accept; submitting for
//                                  acceptance is workItem.updateOwnStatus into review
//   stakeholder "只读摘要"          allowed on report.view; summary versus detail
//                                  is a projection of the read model, not an
//                                  authorization level
const ALLOWED: Readonly<Record<ProjectRole, readonly Permission[]>> = {
  [PROJECT_ROLE.productOwner]: [
    PERMISSION.projectView,
    PERMISSION.backlogView,
    PERMISSION.workItemWrite,
    PERMISSION.backlogPrioritize,
    PERMISSION.workItemEstimate,
    PERMISSION.workItemSetAcceptanceCriteria,
    PERMISSION.sprintCreate,
    PERMISSION.sprintSetGoal,
    PERMISSION.sprintAssignWorkItems,
    PERMISSION.workItemUpdateOwnStatus,
    PERMISSION.workItemSetBlocked,
    PERMISSION.workItemAccept,
    PERMISSION.retrospectiveManage,
    PERMISSION.reportView,
    PERMISSION.workItemSuggest,
  ],
  [PROJECT_ROLE.scrumMaster]: [
    PERMISSION.projectView,
    PERMISSION.backlogView,
    PERMISSION.workItemWrite,
    PERMISSION.backlogPrioritize,
    PERMISSION.workItemEstimate,
    PERMISSION.workItemSetAcceptanceCriteria,
    PERMISSION.sprintCreate,
    PERMISSION.sprintSetGoal,
    PERMISSION.sprintAssignWorkItems,
    PERMISSION.sprintTransition,
    PERMISSION.workItemUpdateOwnStatus,
    PERMISSION.workItemUpdateAnyStatus,
    PERMISSION.workItemSetBlocked,
    PERMISSION.workItemAccept,
    PERMISSION.retrospectiveManage,
    PERMISSION.reportView,
    PERMISSION.workItemSuggest,
  ],
  [PROJECT_ROLE.developer]: [
    PERMISSION.projectView,
    PERMISSION.backlogView,
    PERMISSION.workItemWrite,
    PERMISSION.workItemEstimate,
    PERMISSION.workItemSetAcceptanceCriteria,
    PERMISSION.sprintCreate,
    PERMISSION.sprintSetGoal,
    PERMISSION.sprintAssignWorkItems,
    PERMISSION.workItemUpdateOwnStatus,
    PERMISSION.workItemSetBlocked,
    PERMISSION.retrospectiveManage,
    PERMISSION.reportView,
    PERMISSION.workItemSuggest,
  ],
  [PROJECT_ROLE.stakeholder]: [
    PERMISSION.projectView,
    PERMISSION.backlogView,
    PERMISSION.reportView,
    PERMISSION.workItemSuggest,
  ],
  [PROJECT_ROLE.administrator]: [
    PERMISSION.projectView,
    PERMISSION.backlogView,
    PERMISSION.workItemWrite,
    PERMISSION.backlogPrioritize,
    PERMISSION.workItemSetAcceptanceCriteria,
    PERMISSION.sprintCreate,
    PERMISSION.sprintSetGoal,
    PERMISSION.sprintAssignWorkItems,
    PERMISSION.sprintTransition,
    PERMISSION.workItemUpdateOwnStatus,
    PERMISSION.workItemUpdateAnyStatus,
    PERMISSION.workItemSetBlocked,
    PERMISSION.workItemAccept,
    PERMISSION.retrospectiveManage,
    PERMISSION.reportView,
    PERMISSION.memberManage,
    PERMISSION.projectConfigure,
    PERMISSION.projectArchive,
    PERMISSION.workItemSuggest,
  ],
}

const CONFIGURABLE: Readonly<Record<ProjectRole, readonly Permission[]>> = {
  [PROJECT_ROLE.productOwner]: [PERMISSION.sprintTransition, PERMISSION.workItemUpdateAnyStatus],
  [PROJECT_ROLE.scrumMaster]: [PERMISSION.projectConfigure],
  [PROJECT_ROLE.developer]: [PERMISSION.workItemUpdateAnyStatus],
  [PROJECT_ROLE.stakeholder]: [],
  [PROJECT_ROLE.administrator]: [PERMISSION.workItemEstimate],
}

export function roleGrant(role: ProjectRole, permission: Permission): PermissionGrant {
  if (ALLOWED[role].includes(permission)) {
    return PERMISSION_GRANT.allowed
  }
  if (CONFIGURABLE[role].includes(permission)) {
    return PERMISSION_GRANT.configurable
  }
  return PERMISSION_GRANT.denied
}

/**
 * The edition capability a permission needs on top of its role grant.
 * Everything is core Scrum except managing members, which is the one action
 * that presumes more than one person and so belongs to role-based access
 * control. Capabilities whose features are not modelled yet get no override
 * here: an unused gate is a gate nobody keeps correct.
 */
export function requiredCapability(permission: Permission): Capability {
  return permission === PERMISSION.memberManage ? CAPABILITY.rbac : CAPABILITY.core
}

/**
 * A project's answer for the configurable cells. Stored in `config.json`, so
 * the effective decision is visible as data rather than hidden in a branch.
 */
export type ProjectPermissionPolicy = Readonly<Partial<Record<Permission, readonly ProjectRole[]>>>

/**
 * Shipped defaults. Only one configurable cell is opened: letting developers
 * move any item on the board is how nearly every team runs one, and a board
 * where a developer cannot advance a colleague's card is not a board. The
 * remaining four stay closed, so a project has to opt into them deliberately.
 */
export const DEFAULT_PERMISSION_POLICY: ProjectPermissionPolicy = {
  [PERMISSION.workItemUpdateAnyStatus]: [PROJECT_ROLE.developer],
}

/**
 * Validates a policy read from storage or from a settings form. An entry
 * naming a pair whose base grant is not configurable is refused rather than
 * ignored, which makes the matrix a ceiling: a project can tune the cells the
 * product design marked configurable and nothing else. Silently dropping such
 * an entry would let a settings file look like it granted something it did not.
 */
export function toPermissionPolicy(
  raw: Readonly<Record<string, readonly string[]>>,
): ProjectPermissionPolicy {
  const policy: Partial<Record<Permission, readonly ProjectRole[]>> = {}
  for (const [rawPermission, rawRoles] of Object.entries(raw)) {
    const permission = toPermission(rawPermission)
    const roles = toProjectRoles(rawRoles)
    for (const role of roles) {
      if (roleGrant(role, permission) !== PERMISSION_GRANT.configurable) {
        throw new ValidationError('permission policy may only change configurable cells', {
          permission,
          role,
          grant: roleGrant(role, permission),
        })
      }
    }
    policy[permission] = roles
  }
  return policy
}

/** Everything a permission decision depends on, gathered in one argument. */
export interface PermissionContext {
  readonly roles: readonly ProjectRole[]
  readonly capabilities: CapabilitySet
  readonly policy: ProjectPermissionPolicy
}

/**
 * A member holding several roles gets the strongest grant any of them carries,
 * which is what makes the many-to-many between members and roles additive
 * rather than a puzzle about precedence.
 */
function grantFor(context: PermissionContext, permission: Permission): PermissionGrant {
  let strongest: PermissionGrant = PERMISSION_GRANT.denied
  for (const role of context.roles) {
    const grant = roleGrant(role, permission)
    if (grant === PERMISSION_GRANT.allowed) {
      return PERMISSION_GRANT.allowed
    }
    if (grant === PERMISSION_GRANT.configurable && context.policy[permission]?.includes(role)) {
      strongest = PERMISSION_GRANT.allowed
    }
  }
  return strongest
}

/**
 * Returns a set rather than a predicate because the final permission an agent
 * gets is this intersected with the session's access mode, and a set makes
 * that a plain intersection. It is also directly serializable as the principal
 * a remote handshake reports.
 */
export function effectivePermissions(context: PermissionContext): ReadonlySet<Permission> {
  const granted = new Set<Permission>()
  for (const permission of PERMISSIONS) {
    if (
      context.capabilities.has(requiredCapability(permission)) &&
      grantFor(context, permission) === PERMISSION_GRANT.allowed
    ) {
      granted.add(permission)
    }
  }
  return granted
}

export function hasPermission(context: PermissionContext, permission: Permission): boolean {
  return (
    context.capabilities.has(requiredCapability(permission)) &&
    grantFor(context, permission) === PERMISSION_GRANT.allowed
  )
}

/**
 * The guard an application use case calls before touching a repository. It is
 * not called from inside the entity functions: those stay callable by
 * migrations and importers, which have no actor to check.
 */
export function assertPermission(context: PermissionContext, permission: Permission): void {
  if (!hasPermission(context, permission)) {
    throw new ForbiddenError(`the actor may not ${permission}`, {
      permission,
      roles: [...context.roles],
      requiredCapability: requiredCapability(permission),
    })
  }
}
