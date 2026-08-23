import type { ApplicationDependencies } from '@dsh-scrum/scrum-application'
import type { WriteCoordinator } from './coordinator.js'
import { workspaceLayout } from './paths.js'
import { memberRepository, projectRepository, type StoredEdition } from './repository-project.js'
import { sprintRepository, transactionPort, workItemRepository } from './repository-entities.js'
import { bindingRepository, idempotencyStore } from './repository-local.js'
import { appendSprintProgress, readSprintProgress } from './sprint-progress-log.js'

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

export type WorkspaceRepositories = Pick<
  ApplicationDependencies,
  | 'projects'
  | 'workItems'
  | 'sprints'
  | 'sprintProgressLog'
  | 'transactions'
  | 'members'
  | 'bindings'
  | 'idempotency'
>

export function createWorkspaceRepositories(
  input: WorkspaceRepositoriesInput,
): WorkspaceRepositories {
  const layout = workspaceLayout(input.workspaceRoot)
  const root = input.workspaceRoot
  const run = input.coordinator.run.bind(input.coordinator)

  return {
    projects: projectRepository(root, input.edition, run),
    workItems: workItemRepository(root, layout, run),
    sprints: sprintRepository(root, layout, run),
    // Through the coordinator like every other write. An append is atomic on
    // its own, but an entry is written in the same breath as the sprint it
    // belongs to, and serialising both keeps that pair in one order.
    sprintProgressLog: {
      append: async (entry) => {
        await run(async () => {
          await appendSprintProgress(layout, entry)
        })
      },
      read: async (sprintId) => (await readSprintProgress(layout, sprintId)).entries,
    },
    transactions: transactionPort(layout, run),
    members: memberRepository(root),
    bindings: bindingRepository(layout, run),
    idempotency: idempotencyStore(layout, run),
  }
}
