import {
  WORK_ITEM_TYPE,
  createProjectMember,
  toProjectKey,
  toTenantId,
  type IdentityId,
  type ProjectRole,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'
import {
  createProject,
  createWorkItem,
  type CreateWorkItemCommand,
  type StoredProject,
} from '@dsh-scrum/scrum-application'
import { actor, testIds, type TestDependencies } from './fakes.js'

/** A project whose creator is a member, which is the ordinary starting state. */
export async function project(deps: TestDependencies): Promise<StoredProject> {
  const stored = await createProject(deps, {
    actor: actor(),
    command: {
      tenantId: toTenantId('tnt_01K00000000000000000000001'),
      key: toProjectKey('SCR'),
      name: 'shop-service',
    },
  })
  deps.members.add(deps.projects.owners.get(stored.project.id)!)
  deps.activity.events.length = 0
  return stored
}

export function memberWithRoles(
  deps: TestDependencies,
  stored: StoredProject,
  identityId: IdentityId,
  roles: readonly ProjectRole[],
): void {
  deps.members.add(
    createProjectMember({
      ids: testIds(),
      projectId: stored.project.id,
      identityId,
      roles,
      now: deps.clock.now(),
    }),
  )
}

export async function item(
  deps: TestDependencies,
  stored: StoredProject,
  overrides: Partial<CreateWorkItemCommand> = {},
): Promise<WorkItem> {
  return await createWorkItem(deps, {
    actor: actor(),
    command: {
      projectId: stored.project.id,
      type: WORK_ITEM_TYPE.story,
      title: 'use a coupon',
      ...overrides,
    },
  })
}
