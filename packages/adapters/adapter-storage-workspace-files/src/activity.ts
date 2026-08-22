import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises'
import {
  ValidationError,
  isScrumError,
  toIdentityId,
  toRevision,
  toTimestamp,
  type IdentityId,
  type Revision,
  type Timestamp,
} from '@dsh-scrum/scrum-domain'
import { toActivitySource, type ActivitySource } from '@dsh-scrum/scrum-application'
import { asRecord, nullableField, numberField, stringField } from './json.js'
import { resolveInside, type WorkspaceLayout } from './paths.js'
import type { StoreProblem } from './store.js'

/*
 * The activity vocabulary is the application's. This module used to carry its
 * own copy, written before that layer existed; it goes away now that the store
 * writes through the application's port, because two structurally identical
 * unions are two things nothing would notice drifting apart.
 */

/**
 * One thing that happened, recorded after it happened.
 *
 * The session is here because a change made by an agent has to be traceable to
 * the conversation that asked for it; without that, "the agent did it" is the
 * end of the trail rather than the start of one. It is null for a change made
 * outside any session.
 */
export interface ActivityRecord {
  readonly at: Timestamp
  readonly actorId: IdentityId
  readonly source: ActivitySource
  readonly sessionId: string | null
  readonly action: string
  readonly targetType: string
  readonly targetId: string
  readonly revision: Revision | null
}

/** The month a record belongs to, taken from the canonical timestamp. */
export function activityMonth(at: Timestamp): string {
  return at.slice(0, 'yyyy-mm'.length)
}

export function activityFile(layout: WorkspaceLayout, month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new ValidationError('an activity month must look like 2026-08', { month })
  }
  return resolveInside(layout.activities, `${month}.jsonl`)
}

/**
 * Appends one record.
 *
 * Activity is append-only and split by month, so the file a busy project
 * writes to stays bounded without anything ever rewriting a line. A single
 * short line opened for append lands whole, which is what keeps a concurrent
 * writer from interleaving halfway through one.
 *
 * The record is deliberately not written inside the same operation as the
 * change it describes. An activity write that could fail the change would
 * make the audit trail able to block the work it audits.
 */
export async function appendActivity(
  layout: WorkspaceLayout,
  record: ActivityRecord,
): Promise<void> {
  const file = activityFile(layout, activityMonth(record.at))
  await mkdir(layout.activities, { recursive: true })
  await appendFile(file, `${JSON.stringify(record)}\n`, 'utf8')
}

export interface ActivityReadResult {
  readonly records: readonly ActivityRecord[]
  readonly problems: readonly StoreProblem[]
}

/**
 * Reads one month.
 *
 * A line that cannot be read is reported rather than skipped and rather than
 * failing the whole month. A crash during an append leaves a truncated last
 * line, and a history that silently drops it is a history that quietly lies
 * about what happened.
 */
export async function readActivity(
  layout: WorkspaceLayout,
  month: string,
): Promise<ActivityReadResult> {
  const file = activityFile(layout, month)
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return { records: [], problems: [] }
  }

  const records: ActivityRecord[] = []
  const problems: StoreProblem[] = []
  const lines = text.split('\n')
  // A complete file ends in a newline, so the final split piece is empty. A
  // non-empty one is the tail of an append that never finished.
  const trailing = lines.pop() ?? ''

  lines.forEach((line, index) => {
    if (line === '') {
      return
    }
    try {
      records.push(decodeActivity(JSON.parse(line)))
    } catch (error) {
      problems.push(problemAt(file, index + 1, error))
    }
  })

  if (trailing !== '') {
    problems.push({
      file,
      code: 'VALIDATION',
      message: `${file}:${lines.length + 1} was cut short by an interrupted write`,
    })
  }
  return { records, problems }
}

/** The months a project has activity for, oldest first. */
export async function listActivityMonths(layout: WorkspaceLayout): Promise<readonly string[]> {
  try {
    return (await readdir(layout.activities))
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => name.slice(0, -'.jsonl'.length))
      .filter((month) => /^\d{4}-\d{2}$/.test(month))
      .sort()
  } catch {
    return []
  }
}

function decodeActivity(raw: unknown): ActivityRecord {
  const record = asRecord(raw, 'activity')
  return {
    at: toTimestamp(stringField(record, 'at')),
    actorId: toIdentityId(stringField(record, 'actorId')),
    source: toActivitySource(stringField(record, 'source')),
    sessionId: nullableField(record, 'sessionId', stringField),
    action: stringField(record, 'action'),
    targetType: stringField(record, 'targetType'),
    targetId: stringField(record, 'targetId'),
    revision: mapRevision(nullableField(record, 'revision', numberField)),
  }
}

function mapRevision(value: number | null): Revision | null {
  return value === null ? null : toRevision(value)
}

function problemAt(file: string, line: number, error: unknown): StoreProblem {
  const message = isScrumError(error) ? error.message : (error as Error).message
  return {
    file,
    code: isScrumError(error) ? error.code : 'VALIDATION',
    message: `${file}:${line} ${message}`,
  }
}
