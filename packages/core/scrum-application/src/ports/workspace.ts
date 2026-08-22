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
 * carries one and a second copy could disagree. The path fingerprint and
 * last-verified stamp that table lists are left out until something reads
 * them; a field nobody reads is a field nobody keeps correct.
 */
export interface WorkspaceBinding {
  readonly workspace: WorkspaceRef
  readonly projectId: ProjectId
  readonly linkedBy: IdentityId
  readonly linkedAt: Timestamp
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
