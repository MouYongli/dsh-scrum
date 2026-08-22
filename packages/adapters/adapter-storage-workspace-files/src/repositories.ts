import type { ApplicationDependencies } from '@dsh-scrum/scrum-application'
import type { WriteCoordinator } from './coordinator.js'
import { memberRepository, projectRepository, type StoredEdition } from './repository-project.js'

/**
 * The application's storage ports over one workspace directory.
 *
 * Every write goes through the coordinator, so the per-file revision check
 * cannot be raced by a second writer reading between another's check and
 * replace. Reads do not: a read that queued behind a write would make opening
 * a workspace wait on whatever else is happening inside it.
 */
export interface WorkspaceRepositoriesInput {
  readonly workspaceRoot: string
  readonly coordinator: WriteCoordinator
  readonly edition: StoredEdition
}

export type WorkspaceRepositories = Pick<ApplicationDependencies, 'projects' | 'members'>

export function createWorkspaceRepositories(
  input: WorkspaceRepositoriesInput,
): WorkspaceRepositories {
  const root = input.workspaceRoot
  const run = input.coordinator.run.bind(input.coordinator)

  return {
    projects: projectRepository(root, input.edition, run),
    members: memberRepository(root),
  }
}
