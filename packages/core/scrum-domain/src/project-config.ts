import { ValidationError } from './errors.js'
import type { ProjectId } from './ids.js'
import { requirePositiveInteger } from './integers.js'
import { createEntityMetadata, touchEntityMetadata, type EntityMetadata } from './metadata.js'
import {
  DEFAULT_PERMISSION_POLICY,
  toPermissionPolicy,
  type ProjectPermissionPolicy,
} from './permissions.js'
import { requireText } from './text.js'
import type { Timestamp } from './time.js'
import { DEFAULT_WORKFLOW_STATUSES, toWorkItemStatus, type WorkItemStatus } from './workflow.js'

const MAX_DISPLAY_NAME_LENGTH = 40
const MAX_DEFINITION_OF_DONE_ENTRIES = 50
const MAX_DEFINITION_OF_DONE_LENGTH = 200
const MAX_SPRINT_LENGTH_IN_DAYS = 28
const DEFAULT_SPRINT_LENGTH_IN_DAYS = 14

/** How the team sizes work. Persisted, so the values may be added to but not renamed. */
export const ESTIMATION_METHOD = {
  storyPoints: 'story_points',
  hours: 'hours',
  count: 'count',
} as const

export type EstimationMethod = (typeof ESTIMATION_METHOD)[keyof typeof ESTIMATION_METHOD]

const ESTIMATION_METHODS: readonly string[] = Object.values(ESTIMATION_METHOD)

export function toEstimationMethod(value: string): EstimationMethod {
  if (!ESTIMATION_METHODS.includes(value)) {
    throw new ValidationError(`EstimationMethod must be one of ${ESTIMATION_METHODS.join(', ')}`, {
      value,
    })
  }
  return value as EstimationMethod
}

/**
 * Everything about a project a user is allowed to tune. Stored as `config.json`
 * next to `project.json`.
 *
 * The type is the enforcement of one storage rule: no credential, token or key
 * may ever appear here. `.scrum/` is committed to the user's repository as
 * often as not, so a field that can hold a secret is a field that will leak
 * one. Adding one is a deliberate contract change and the contract test that
 * pins the serialized key set will fail until it is acknowledged.
 */
export interface ProjectConfig extends EntityMetadata {
  readonly projectId: ProjectId
  readonly statuses: readonly WorkItemStatus[]
  readonly statusDisplayNames: Readonly<Partial<Record<WorkItemStatus, string>>>
  readonly estimationMethod: EstimationMethod
  readonly sprintLengthInDays: number
  readonly definitionOfDone: readonly string[]
  readonly workInProgressLimit: number | null
  readonly permissionPolicy: ProjectPermissionPolicy
}

export function createDefaultProjectConfig(projectId: ProjectId, now: Timestamp): ProjectConfig {
  return {
    ...createEntityMetadata(now),
    projectId,
    statuses: DEFAULT_WORKFLOW_STATUSES,
    statusDisplayNames: {},
    estimationMethod: ESTIMATION_METHOD.storyPoints,
    sprintLengthInDays: DEFAULT_SPRINT_LENGTH_IN_DAYS,
    definitionOfDone: [],
    workInProgressLimit: null,
    permissionPolicy: DEFAULT_PERMISSION_POLICY,
  }
}

export interface ProjectConfigChanges {
  readonly statusDisplayNames?: Readonly<Record<string, string>> | undefined
  readonly estimationMethod?: EstimationMethod | undefined
  readonly sprintLengthInDays?: number | undefined
  readonly definitionOfDone?: readonly string[] | undefined
  readonly workInProgressLimit?: number | null | undefined
  readonly permissionPolicy?: Readonly<Record<string, readonly string[]>> | undefined
}

/**
 * `statuses` is not in `ProjectConfigChanges`: a custom workflow changes what
 * every stored work item status means and needs a migration, not an edit.
 * Renaming a column is what `statusDisplayNames` is for.
 */
export function updateProjectConfig(
  config: ProjectConfig,
  changes: ProjectConfigChanges,
  now: Timestamp,
): ProjectConfig {
  return {
    ...config,
    ...touchEntityMetadata(config, now),
    statusDisplayNames:
      changes.statusDisplayNames === undefined
        ? config.statusDisplayNames
        : toStatusDisplayNames(changes.statusDisplayNames),
    estimationMethod: changes.estimationMethod ?? config.estimationMethod,
    sprintLengthInDays:
      changes.sprintLengthInDays === undefined
        ? config.sprintLengthInDays
        : toSprintLengthInDays(changes.sprintLengthInDays),
    definitionOfDone:
      changes.definitionOfDone === undefined
        ? config.definitionOfDone
        : toDefinitionOfDone(changes.definitionOfDone),
    workInProgressLimit:
      changes.workInProgressLimit === undefined
        ? config.workInProgressLimit
        : toWorkInProgressLimit(changes.workInProgressLimit),
    permissionPolicy:
      changes.permissionPolicy === undefined
        ? config.permissionPolicy
        : toPermissionPolicy(changes.permissionPolicy),
  }
}

function toStatusDisplayNames(
  raw: Readonly<Record<string, string>>,
): Readonly<Partial<Record<WorkItemStatus, string>>> {
  const names: Partial<Record<WorkItemStatus, string>> = {}
  for (const [status, displayName] of Object.entries(raw)) {
    names[toWorkItemStatus(status)] = requireText(
      displayName,
      'Status display name',
      MAX_DISPLAY_NAME_LENGTH,
    )
  }
  return names
}

function toSprintLengthInDays(value: number): number {
  const days = requirePositiveInteger(value, 'Sprint length in days')
  if (days > MAX_SPRINT_LENGTH_IN_DAYS) {
    throw new ValidationError(
      `Sprint length in days must be at most ${MAX_SPRINT_LENGTH_IN_DAYS}`,
      { value, maxSprintLengthInDays: MAX_SPRINT_LENGTH_IN_DAYS },
    )
  }
  return days
}

function toDefinitionOfDone(entries: readonly string[]): readonly string[] {
  if (entries.length > MAX_DEFINITION_OF_DONE_ENTRIES) {
    throw new ValidationError(
      `Definition of done must have at most ${MAX_DEFINITION_OF_DONE_ENTRIES} entries`,
      { count: entries.length, maxEntries: MAX_DEFINITION_OF_DONE_ENTRIES },
    )
  }
  return entries.map((entry) =>
    requireText(entry, 'Definition of done entry', MAX_DEFINITION_OF_DONE_LENGTH),
  )
}

/**
 * `null` is the stored spelling of "no limit", which is why the limit is not
 * simply an optional field: absent and unlimited must not be distinguishable.
 */
function toWorkInProgressLimit(value: number | null): number | null {
  return value === null ? null : requirePositiveInteger(value, 'Work in progress limit')
}
