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
const MAX_CHECKLIST_ENTRIES = 50
const MAX_CHECKLIST_LENGTH = 200
const MAX_SPRINT_LENGTH_IN_DAYS = 28
const DEFAULT_SPRINT_LENGTH_IN_DAYS = 14
const MAX_STALLED_AFTER_DAYS = 60

/**
 * Three days: long enough that a card touched on Monday is not flagged on
 * Tuesday, short enough that a two-week sprint notices before its review.
 * Exported because the store needs it to read a config written before the
 * field existed.
 */
export const DEFAULT_STALLED_AFTER_DAYS = 3

/** How the team sizes work. Persisted, so the values may be added to but not renamed. */
export const ESTIMATION_METHOD = {
  storyPoints: 'story_points',
  hours: 'hours',
  count: 'count',
} as const

export type EstimationMethod = (typeof ESTIMATION_METHOD)[keyof typeof ESTIMATION_METHOD]

/**
 * Which half of a closed sprint velocity counts.
 *
 * Everything at the last column has left the board; only some of it was
 * delivered, and the rest was dropped, deduplicated or never reproduced. A
 * team that closed a sprint by abandoning half of it did not get faster, so
 * `delivered` is the default. `finished` is here because some teams report
 * throughput rather than delivery and would otherwise keep a second number by
 * hand.
 *
 * Persisted, so the values may be added to but not renamed.
 */
export const VELOCITY_BASIS = {
  delivered: 'delivered',
  finished: 'finished',
} as const

export type VelocityBasis = (typeof VELOCITY_BASIS)[keyof typeof VELOCITY_BASIS]

const VELOCITY_BASES: readonly string[] = Object.values(VELOCITY_BASIS)

export function toVelocityBasis(value: string): VelocityBasis {
  if (!VELOCITY_BASES.includes(value)) {
    throw new ValidationError(`VelocityBasis must be one of ${VELOCITY_BASES.join(', ')}`, {
      value,
    })
  }
  return value as VelocityBasis
}

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
  /** What a work item must carry before a sprint may take it on. */
  readonly definitionOfReady: readonly string[]
  readonly definitionOfDone: readonly string[]
  readonly workInProgressLimit: number | null
  readonly velocityBasis: VelocityBasis
  /**
   * How long an item may sit in one status before a board calls it stalled.
   *
   * Configured rather than fixed: a two-week sprint and a one-week sprint do
   * not agree on how long is too long, and a constant would be right for one
   * of them and noise for the other.
   */
  readonly stalledAfterDays: number
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
    definitionOfReady: [],
    definitionOfDone: [],
    workInProgressLimit: null,
    velocityBasis: VELOCITY_BASIS.delivered,
    stalledAfterDays: DEFAULT_STALLED_AFTER_DAYS,
    permissionPolicy: DEFAULT_PERMISSION_POLICY,
  }
}

export interface ProjectConfigChanges {
  readonly statusDisplayNames?: Readonly<Record<string, string>> | undefined
  readonly estimationMethod?: EstimationMethod | undefined
  readonly sprintLengthInDays?: number | undefined
  readonly definitionOfReady?: readonly string[] | undefined
  readonly definitionOfDone?: readonly string[] | undefined
  readonly workInProgressLimit?: number | null | undefined
  readonly velocityBasis?: VelocityBasis | undefined
  readonly stalledAfterDays?: number | undefined
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
    definitionOfReady:
      changes.definitionOfReady === undefined
        ? config.definitionOfReady
        : toChecklist(changes.definitionOfReady, 'Definition of ready'),
    definitionOfDone:
      changes.definitionOfDone === undefined
        ? config.definitionOfDone
        : toChecklist(changes.definitionOfDone, 'Definition of done'),
    workInProgressLimit:
      changes.workInProgressLimit === undefined
        ? config.workInProgressLimit
        : toWorkInProgressLimit(changes.workInProgressLimit),
    velocityBasis: changes.velocityBasis ?? config.velocityBasis,
    stalledAfterDays:
      changes.stalledAfterDays === undefined
        ? config.stalledAfterDays
        : toStalledAfterDays(changes.stalledAfterDays),
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

/**
 * A named checklist. Ready and done are held to the same limits because they
 * are the same kind of thing — a short list a person reads before deciding —
 * and two ceilings would only differ by accident.
 */
function toChecklist(entries: readonly string[], name: string): readonly string[] {
  if (entries.length > MAX_CHECKLIST_ENTRIES) {
    throw new ValidationError(`${name} must have at most ${MAX_CHECKLIST_ENTRIES} entries`, {
      count: entries.length,
      maxEntries: MAX_CHECKLIST_ENTRIES,
    })
  }
  return entries.map((entry) => requireText(entry, `${name} entry`, MAX_CHECKLIST_LENGTH))
}

function toStalledAfterDays(value: number): number {
  const days = requirePositiveInteger(value, 'Stalled after days')
  if (days > MAX_STALLED_AFTER_DAYS) {
    throw new ValidationError(`Stalled after days must be at most ${MAX_STALLED_AFTER_DAYS}`, {
      value,
      maxStalledAfterDays: MAX_STALLED_AFTER_DAYS,
    })
  }
  return days
}

/**
 * `null` is the stored spelling of "no limit", which is why the limit is not
 * simply an optional field: absent and unlimited must not be distinguishable.
 */
function toWorkInProgressLimit(value: number | null): number | null {
  return value === null ? null : requirePositiveInteger(value, 'Work in progress limit')
}
