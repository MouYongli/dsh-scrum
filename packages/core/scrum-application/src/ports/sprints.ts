import type { ProjectId, Sprint, SprintId } from '@dsh-scrum/scrum-domain'

/**
 * Reading sprints.
 *
 * Read-only for now: planning work into a sprint has to know the sprint exists
 * and still accepts items, and that is the only thing needing sprints yet. The
 * write side arrives with the sprint lifecycle use cases.
 */
export interface SprintRepository {
  find(projectId: ProjectId, id: SprintId): Promise<Sprint | null>
  list(projectId: ProjectId): Promise<readonly Sprint[]>
}
