import type { ProjectId, Revision, Sprint, SprintId } from '@dsh-scrum/scrum-domain'

/**
 * Reading and writing sprints one at a time.
 *
 * A change that also moves work items goes through `TransactionPort` instead:
 * closing a sprint is one decision spanning two entity types, and a repository
 * that could write a sprint on its own would be a second way to make half of
 * it.
 */
export interface SprintRepository {
  find(projectId: ProjectId, id: SprintId): Promise<Sprint | null>
  list(projectId: ProjectId): Promise<readonly Sprint[]>
  /** Refuses with a `ConflictError` if the identifier is already taken. */
  create(sprint: Sprint): Promise<void>
  /** The next free identifier for the project. See `WorkItemRepository`. */
  nextIdentifier(projectId: ProjectId): Promise<SprintId>
  save(sprint: Sprint, expected: Revision): Promise<void>
}
