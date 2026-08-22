import type { Project, ProjectConfig, Sprint, WorkItem } from '@dsh-scrum/scrum-domain'
import type { SprintProgress } from '@dsh-scrum/scrum-application'

// What a tool hands the model. Deliberately not the stored entity: a tool
// result is replayed into every later turn of the conversation, so each field
// costs context on every request, and shipping the entity would mean every
// field ever added to it silently starts costing that too.
//
// Nothing here is a credential, a path or an identity beyond the ids the model
// needs to ask its next question.

export interface ProjectSummary {
  readonly id: string
  readonly key: string
  readonly name: string
  readonly description: string
  readonly status: string
  readonly revision: number
  readonly statuses: readonly string[]
  readonly estimationMethod: string
  readonly sprintLengthInDays: number
}

export function projectSummary(project: Project, config: ProjectConfig): ProjectSummary {
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    status: project.status,
    revision: project.revision,
    statuses: [...config.statuses],
    estimationMethod: config.estimationMethod,
    sprintLengthInDays: config.sprintLengthInDays,
  }
}

export interface WorkItemSummary {
  readonly id: string
  readonly type: string
  readonly title: string
  readonly status: string
  readonly priority: string
  readonly assigneeId: string | null
  readonly estimate: number | null
  readonly sprintId: string | null
  readonly blockedReason: string | null
  readonly revision: number
}

/** The card, not the whole item: description, criteria and links are a lookup away. */
export function workItemSummary(item: WorkItem): WorkItemSummary {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    status: item.status,
    priority: item.priority,
    assigneeId: item.assigneeId,
    estimate: item.estimate,
    sprintId: item.sprintId,
    blockedReason: item.blockedReason,
    revision: item.revision,
  }
}

export interface WorkItemDetail extends WorkItemSummary {
  readonly description: string
  readonly parentId: string | null
  readonly dependsOn: readonly string[]
  readonly labels: readonly string[]
  readonly acceptanceCriteria: readonly { readonly text: string; readonly satisfied: boolean }[]
}

export function workItemDetail(item: WorkItem): WorkItemDetail {
  return {
    ...workItemSummary(item),
    description: item.description,
    parentId: item.parentId,
    dependsOn: [...item.dependsOn],
    labels: [...item.labels],
    acceptanceCriteria: item.acceptanceCriteria.map((criterion) => ({ ...criterion })),
  }
}

export interface SprintSummary {
  readonly id: string
  readonly name: string
  readonly goal: string
  readonly status: string
  readonly startDate: string
  readonly endDate: string
  readonly revision: number
}

export function sprintSummary(sprint: Sprint): SprintSummary {
  return {
    id: sprint.id,
    name: sprint.name,
    goal: sprint.goal,
    status: sprint.status,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    revision: sprint.revision,
  }
}

export interface SprintProgressSummary {
  readonly sprintId: string
  readonly byStatus: Readonly<Record<string, { readonly count: number; readonly estimate: number }>>
  readonly total: { readonly count: number; readonly estimate: number }
  readonly finished: { readonly count: number; readonly estimate: number }
  readonly unestimated: number
}

export function progressSummary(progress: SprintProgress): SprintProgressSummary {
  return {
    sprintId: progress.sprintId,
    byStatus: Object.fromEntries(
      Object.entries(progress.byStatus).map(([status, totals]) => [status, { ...totals }]),
    ),
    total: { ...progress.total },
    finished: { ...progress.finished },
    unestimated: progress.unestimated,
  }
}
