import { ValidationError } from './errors.js'
import { requireOptionalMultilineText, requireOptionalText } from './text.js'
import { WORK_ITEM_TYPE, type WorkItemType } from './work-item-type.js'

const MAX_COLOR_LENGTH = 32
const MAX_VERSION_LENGTH = 100
const MAX_ENVIRONMENT_LENGTH = 500
const MAX_PROSE_LENGTH = 5000
const MAX_TIMEBOX_DAYS = 365

/**
 * How much a defect hurts, which is not the same question as when to fix it.
 *
 * Kept apart from `priority` because the two genuinely disagree: a defect that
 * reaches few users but blocks a release is minor in severity and urgent in
 * priority, and a single field would have to lose one of those answers.
 *
 * Deliberately not the priority words. A shared vocabulary between two fields
 * that mean different things is read as one field split in two.
 */
export const BUG_SEVERITY = {
  blocker: 'blocker',
  major: 'major',
  minor: 'minor',
  trivial: 'trivial',
} as const

export type BugSeverity = (typeof BUG_SEVERITY)[keyof typeof BUG_SEVERITY]

const SEVERITIES: readonly string[] = Object.values(BUG_SEVERITY)

export function toBugSeverity(value: string): BugSeverity {
  if (!SEVERITIES.includes(value)) {
    throw new ValidationError(`BugSeverity must be one of ${SEVERITIES.join(', ')}`, { value })
  }
  return value as BugSeverity
}

/** What an epic carries beyond the common fields. */
export interface EpicDetails {
  /** How the epic is marked on the board and the timeline. */
  readonly color: string
}

/**
 * What a task carries.
 *
 * Both fields describe a spike, and `architecture.md` 7.5 lists them under
 * `category: spike`. That says when they are used, not when the file has room
 * for them: making the category a precondition for the fields existing would
 * put the order somebody fills a form in into the schema, and would lose what
 * they typed if they set the category last.
 */
export interface TaskDetails {
  /** Days the investigation is allowed to run, so that it cannot run forever. */
  readonly timebox: number | null
  /** What the spike concluded, which is the only thing that finishes one. */
  readonly outcome: string
}

/** What a bug carries. */
export interface BugDetails {
  /** `null` while nobody has judged it. */
  readonly severity: BugSeverity | null
  readonly stepsToReproduce: string
  readonly expected: string
  readonly actual: string
  readonly environment: string
  readonly affectedVersion: string
  /** Whether something that used to work stopped working. */
  readonly isRegression: boolean
  readonly rootCause: string
}

/** A story and a subtask carry nothing of their own. */
export type EmptyDetails = Record<string, never>

export type WorkItemDetails = EpicDetails | TaskDetails | BugDetails | EmptyDetails

const NO_DETAILS: EmptyDetails = {}

/**
 * Builds the details a type carries, from whatever a caller supplied.
 *
 * One normaliser for the domain and the store, so the shape a rule is written
 * against is the shape that was read off disk. A second reader would be the
 * one that stops recognising a field the first one gained.
 *
 * Absent is a value: every field defaults, so an item created without details
 * and a record written before the field existed both land on the same shape.
 * Keys this type does not carry are ignored rather than refused, so that a
 * caller may hand over what it read without pruning it first.
 *
 * A `type` key is the exception. Callers that carry the details across a
 * boundary tag them with the type they describe, and a tag naming a different
 * type is the one mismatch worth refusing: the fields beside it would
 * otherwise be dropped in silence, which is how a bug report becomes an empty
 * epic without anybody being told.
 */
export function toWorkItemDetails(type: WorkItemType, value: unknown = {}): WorkItemDetails {
  const record = asRecord(type, value)
  assertDescribes(type, record)
  switch (type) {
    case WORK_ITEM_TYPE.epic:
      return { color: text(record, 'color', 'Epic colour', MAX_COLOR_LENGTH) }
    case WORK_ITEM_TYPE.task:
      return {
        timebox: days(record, 'timebox'),
        outcome: prose(record, 'outcome', 'Spike outcome'),
      }
    case WORK_ITEM_TYPE.bug:
      return {
        severity: severity(record),
        stepsToReproduce: prose(record, 'stepsToReproduce', 'Steps to reproduce'),
        expected: prose(record, 'expected', 'Expected behaviour'),
        actual: prose(record, 'actual', 'Actual behaviour'),
        environment: text(record, 'environment', 'Environment', MAX_ENVIRONMENT_LENGTH),
        affectedVersion: text(record, 'affectedVersion', 'Affected version', MAX_VERSION_LENGTH),
        isRegression: flag(record, 'isRegression'),
        rootCause: prose(record, 'rootCause', 'Root cause'),
      }
    case WORK_ITEM_TYPE.story:
    case WORK_ITEM_TYPE.subtask:
      return NO_DETAILS
  }
}

function assertDescribes(type: WorkItemType, record: Record<string, unknown>): void {
  const tag = record['type']
  if (tag !== undefined && tag !== type) {
    throw new ValidationError('these type details describe a different type', {
      type,
      found: typeof tag === 'string' ? tag : typeof tag,
    })
  }
}

function asRecord(type: WorkItemType, value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {}
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('type details must be an object', { type })
  }
  return value as Record<string, unknown>
}

/**
 * A missing field reads as empty rather than as a refusal. These are the
 * fields an item is created without and filled in later, so absent and blank
 * describe the same state and distinguishing them would mean two spellings of
 * "nobody has written this yet".
 */
function readText(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${key} must be text`, { field: key, found: typeof value })
  }
  return value
}

function text(
  record: Record<string, unknown>,
  key: string,
  label: string,
  maxLength: number,
): string {
  return requireOptionalText(readText(record, key), label, maxLength)
}

/** The fields somebody pastes a log or a paragraph into keep their newlines. */
function prose(record: Record<string, unknown>, key: string, label: string): string {
  return requireOptionalMultilineText(readText(record, key), label, MAX_PROSE_LENGTH)
}

function flag(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (value === undefined || value === null) {
    return false
  }
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${key} must be true or false`, { field: key, found: typeof value })
  }
  return value
}

function days(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value !== 'number') {
    throw new ValidationError(`${key} must be a number of days`, {
      field: key,
      found: typeof value,
    })
  }
  if (!Number.isInteger(value) || value < 1 || value > MAX_TIMEBOX_DAYS) {
    throw new ValidationError(
      `${key} must be a whole number of days between 1 and ${MAX_TIMEBOX_DAYS}`,
      { field: key, value },
    )
  }
  return value
}

function severity(record: Record<string, unknown>): BugSeverity | null {
  const value = record['severity']
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new ValidationError('severity must be text', { found: typeof value })
  }
  return toBugSeverity(value)
}
