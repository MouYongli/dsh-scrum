export type { ActorContext, UseCaseRequest } from './actor.js'
export { recordActivity } from './activity.js'
export type { AuthorizedProject } from './authorization.js'
export {
  assertCapability,
  authorizeProject,
  loadProject,
  resolvePermissions,
} from './authorization.js'
export type { IdempotentOperation, IdempotentOutcome } from './idempotency.js'
export { runIdempotently, stringReference } from './idempotency.js'
export type { ApplicationDependencies } from './dependencies.js'
export type {
  ActivityDescription,
  ActivityEvent,
  ActivityRecorder,
  ActivitySource,
} from './ports/activity.js'
export { ACTIVITY_SOURCE, ACTIVITY_SOURCES, toActivitySource } from './ports/activity.js'
export type { IdempotencyKey, IdempotencyRecord, IdempotencyStore } from './ports/idempotency.js'
export { toIdempotencyKey } from './ports/idempotency.js'
export type { MemberRepository } from './ports/members.js'
export type { SprintRepository } from './ports/sprints.js'
export type { SprintProgress, StatusTotals } from './sprint-progress.js'
export { sprintProgress } from './sprint-progress.js'
export type { WorkItemFilter, WorkItemRepository } from './ports/work-items.js'
export type {
  AtomicWrites,
  SprintWrite,
  TransactionPort,
  WorkItemWrite,
} from './ports/transactions.js'
export { filterWorkItems, matchesWorkItemFilter } from './ports/work-items.js'
export type { NewProject, ProjectRepository, StoredProject } from './ports/projects.js'
export type {
  WorkspaceBinding,
  WorkspaceBindingRepository,
  WorkspaceRef,
} from './ports/workspace.js'
export { toWorkspaceRef } from './ports/workspace.js'
export type { CreateProjectCommand, ProjectCommand } from './use-cases/project.js'
export { archiveProject, createProject, getProject, restoreProject } from './use-cases/project.js'
export type { BindWorkspaceCommand, ResolvedBinding } from './use-cases/workspace.js'
export { bindWorkspace, resolveWorkspaceBinding, unbindWorkspace } from './use-cases/workspace.js'
export type {
  CreateWorkItemCommand,
  ListWorkItemsCommand,
  SetAcceptanceCriterionCommand,
  UpdateWorkItemCommand,
  WorkItemCommand,
} from './use-cases/work-item.js'
export {
  createWorkItem,
  getWorkItem,
  listWorkItems,
  setAcceptanceCriterion,
  updateWorkItem,
} from './use-cases/work-item.js'
export type {
  BlockWorkItemCommand,
  DeleteWorkItemCommand,
  MoveWorkItemRankCommand,
  MoveWorkItemStatusCommand,
  PlanSprintCommand,
  SetWorkItemParentCommand,
  WorkItemDependencyCommand,
} from './use-cases/work-item-planning.js'
export {
  blockWorkItem,
  deleteWorkItem,
  moveWorkItemStatus,
  moveWorkItemToRank,
  planSprint,
  setWorkItemDependency,
  setWorkItemParent,
} from './use-cases/work-item-planning.js'
export type {
  CloseSprintCommand,
  CreateSprintCommand,
  Disposition,
  RescheduleSprintCommand,
  SprintCommand,
  SprintProgressCommand,
  StartSprintCommand,
  UpdateSprintCommand,
} from './use-cases/sprint.js'
export {
  closeSprint,
  createSprint,
  getSprint,
  listSprints,
  readSprintProgress,
  reschedule,
  startSprint,
  updateSprint,
} from './use-cases/sprint.js'
