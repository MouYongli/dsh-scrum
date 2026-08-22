import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createDirectoryLockPort,
  createWorkspaceRepositories,
  createWriteCoordinator,
  workspaceLayout,
  type WorkspaceRepositories,
} from '@dsh-scrum/adapter-storage-workspace-files'
import {
  EDITION,
  PROJECT_ROLES,
  WORK_ITEM_TYPE,
  createDefaultProjectConfig,
  createProject,
  createSprint,
  createWorkItem,
  isScrumError,
  rankBetween,
  toIdentityId,
  toMemberId,
  toProjectKey,
  toSprintId,
  toTenantId,
  toTimestamp,
  toWorkItemId,
  type IdGenerator,
  type Sprint,
  type WorkItem,
} from '@dsh-scrum/scrum-domain'

export const ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABV'
export const OTHER_ULID = '01K5TFQ8Z4N7C2M9XPRWD3HABW'
export const OWNER = toIdentityId(`idt_${ULID}`)
export const STRANGER = toIdentityId(`idt_${OTHER_ULID}`)
export const T1 = toTimestamp('2026-08-20T10:00:00.000Z')
export const T2 = toTimestamp('2026-08-20T11:00:00.000Z')

const ids: IdGenerator = { nextUlid: () => ULID }

export const project = createProject({
  ids,
  tenantId: toTenantId(`tnt_${ULID}`),
  key: toProjectKey('SCR'),
  name: 'shop-service',
  createdBy: OWNER,
  now: T1,
})

/** The repositories over one workspace, composed the way the edition does. */
export function openWorkspace(workspaceRoot: string): WorkspaceRepositories {
  return createWorkspaceRepositories({
    workspaceRoot,
    coordinator: createWriteCoordinator(workspaceLayout(workspaceRoot), createDirectoryLockPort()),
    edition: EDITION.community,
  })
}

export async function temporaryWorkspace(label: string): Promise<string> {
  return await mkdtemp(join(tmpdir(), `dsh-scrum-${label}-`))
}

export async function removeWorkspace(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true })
}

/** A workspace with the project already created, which is where writing starts. */
export async function initialisedWorkspace(
  label: string,
): Promise<{ root: string; repositories: WorkspaceRepositories }> {
  const root = await temporaryWorkspace(label)
  const repositories = openWorkspace(root)
  await repositories.projects.create({
    project,
    config: createDefaultProjectConfig(project.id, T1),
    owner: {
      schemaVersion: project.schemaVersion,
      revision: project.revision,
      createdAt: T1,
      updatedAt: T1,
      id: toMemberId(`mbr_${ULID}`),
      projectId: project.id,
      identityId: OWNER,
      roles: PROJECT_ROLES,
      status: 'active',
    },
  })
  return { root, repositories }
}

export function item(key: string): WorkItem {
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

export function sprintOf(id: string): Sprint {
  return createSprint({
    id: toSprintId(id),
    projectId: project.id,
    name: id,
    startDate: toTimestamp('2026-09-01T00:00:00.000Z'),
    endDate: toTimestamp('2026-09-15T00:00:00.000Z'),
    createdBy: OWNER,
    now: T1,
  })
}

/** The error code a call reported, or undefined when it did not fail. */
export async function codeOf(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run()
    return undefined
  } catch (error: unknown) {
    return isScrumError(error) ? error.code : undefined
  }
}
