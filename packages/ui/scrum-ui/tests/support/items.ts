import {
  INITIAL_REVISION,
  PRIORITY,
  SPRINT_STATUS,
  WORK_ITEM_STATUS,
  WORK_ITEM_TYPE,
  toIdentityId,
  toProjectId,
  toRank,
  toSprintId,
  toTimestamp,
  toWorkItemId,
  workItemLevel,
  type AcceptanceCriterion,
  type Priority,
  type Revision,
  type Sprint,
  type SprintId,
  type SprintStatus,
  type WorkItem,
  type WorkItemId,
  type WorkItemStatus,
  type WorkItemType,
} from '@dsh-scrum/scrum-domain'

/**
 * Work items for the interface tests.
 *
 * Built through the domain's own constructors rather than cast from literals:
 * a fixture that bypassed them could carry a shape the store can never produce,
 * and the screen would be verified against data that does not exist.
 */
const NOW = toTimestamp('2026-03-01T09:00:00.000Z')
const PROJECT = toProjectId('prj_01ARZ3NDEKTSV4RRFFQ69G5FAV')
const REPORTER = toIdentityId('idt_01ARZ3NDEKTSV4RRFFQ69G5FAW')

export interface ItemOverrides {
  readonly type?: WorkItemType
  readonly title?: string
  readonly description?: string
  readonly status?: WorkItemStatus
  readonly priority?: Priority
  readonly estimate?: number | null
  readonly sprintId?: SprintId | null
  readonly parentId?: WorkItemId | null
  readonly dependsOn?: readonly WorkItemId[]
  readonly blockedReason?: string | null
  readonly labels?: readonly string[]
  readonly acceptanceCriteria?: readonly AcceptanceCriterion[]
}

export function itemId(sequence: number): WorkItemId {
  return toWorkItemId(`SCR-${sequence}`)
}

export interface SprintOverrides {
  readonly name?: string
  readonly goal?: string
  readonly status?: SprintStatus
  readonly revision?: Revision
}

export function sprintId(sequence: number): SprintId {
  return toSprintId(`sprint-${sequence}`)
}

export function sprint(sequence: number, overrides: SprintOverrides = {}): Sprint {
  return {
    schemaVersion: 1 as Sprint['schemaVersion'],
    revision: overrides.revision ?? INITIAL_REVISION,
    createdAt: NOW,
    updatedAt: NOW,
    id: sprintId(sequence),
    projectId: PROJECT,
    name: overrides.name ?? `第 ${sequence} 个 Sprint`,
    goal: overrides.goal ?? '',
    status: overrides.status ?? SPRINT_STATUS.planned,
    startDate: NOW,
    endDate: toTimestamp('2026-03-15T09:00:00.000Z'),
    startedAt: null,
    closedAt: null,
    resultSummary: '',
    createdBy: REPORTER,
  }
}

export function item(sequence: number, overrides: ItemOverrides = {}): WorkItem {
  const type = overrides.type ?? WORK_ITEM_TYPE.story
  return {
    schemaVersion: 1 as WorkItem['schemaVersion'],
    revision: INITIAL_REVISION,
    createdAt: NOW,
    updatedAt: NOW,
    id: itemId(sequence),
    projectId: PROJECT,
    type,
    level: workItemLevel(type),
    title: overrides.title ?? `工作项 ${sequence}`,
    description: overrides.description ?? '',
    status: overrides.status ?? WORK_ITEM_STATUS.backlog,
    priority: overrides.priority ?? PRIORITY.medium,
    assigneeId: null,
    reporterId: REPORTER,
    estimate: overrides.estimate === undefined ? null : overrides.estimate,
    sprintId: overrides.sprintId ?? null,
    parentId: overrides.parentId ?? null,
    dependsOn: overrides.dependsOn ?? [],
    rank: toRank(`a${sequence}z`),
    blockedReason: overrides.blockedReason ?? null,
    labels: overrides.labels ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
  }
}
