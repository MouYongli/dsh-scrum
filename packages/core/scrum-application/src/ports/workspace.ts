import {
  ValidationError,
  type IdentityId,
  type ProjectId,
  type Timestamp,
} from '@dsh-scrum/scrum-domain'

const MAX_REFERENCE_LENGTH = 200

/**
 * Which workspace, on which Harness installation.
 *
 * The instance is part of the identity because the same workspace path on two
 * machines is two workspaces, and a binding that ignored it would follow a
 * synced folder onto a machine it was never meant to reach.
 */
export interface WorkspaceRef {
  readonly instanceId: string
  readonly workspaceId: string
}

function requireReference(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_REFERENCE_LENGTH) {
    throw new ValidationError(`${label} must be between 1 and ${MAX_REFERENCE_LENGTH} characters`, {
      value,
    })
  }
  return trimmed
}

export function toWorkspaceRef(instanceId: string, workspaceId: string): WorkspaceRef {
  return {
    instanceId: requireReference(instanceId, 'Harness instance id'),
    workspaceId: requireReference(workspaceId, 'Harness workspace id'),
  }
}

/**
 * One workspace attached to one project.
 *
 * Deliberately narrower than the link table in the architecture document: it
 * carries no id of its own, because `(instanceId, workspaceId)` already
 * identifies it uniquely, and no tenant, because the project it points at
 * carries one and a second copy could disagree.
 *
 * `pathFingerprint` records where the workspace was when it was attached. It
 * is never the key: the workspace id is, so a rename or a move keeps the
 * binding. It exists only so a workspace that now sits somewhere else can be
 * reported rather than silently used, which is the case where a synced folder
 * or a restored backup has quietly become a different directory.
 */
export interface WorkspaceBinding {
  readonly workspace: WorkspaceRef
  readonly projectId: ProjectId
  readonly linkedBy: IdentityId
  readonly linkedAt: Timestamp
  readonly pathFingerprint: string
}

/**
 * Where bindings live.
 *
 * `remove` may refuse: in Community the binding is not a record but the
 * presence of `.scrum/project.json`, and removing it would delete the project
 * rather than detach it. An edition whose project data lives elsewhere — a
 * remote service — implements it as deleting the local link.
 */
export interface WorkspaceBindingRepository {
  find(workspace: WorkspaceRef): Promise<WorkspaceBinding | null>
  save(binding: WorkspaceBinding): Promise<void>
  remove(workspace: WorkspaceRef): Promise<void>
}
