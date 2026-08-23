import { appendFile, mkdir, readFile } from 'node:fs/promises'
import {
  ValidationError,
  isScrumError,
  toSprintId,
  toTimestamp,
  toWorkItemId,
  type SprintId,
} from '@dsh-scrum/scrum-domain'
import type { SprintProgressEntry } from '@dsh-scrum/scrum-application'
import { asRecord, numberField, stringArrayField, stringField } from './json.js'
import { sprintProgressFile, type WorkspaceLayout } from './paths.js'
import type { StoreProblem } from './store.js'

/**
 * Appends one entry.
 *
 * One file per sprint and one whole line per record, the way activity is
 * written. A short line opened for append lands whole, which is what keeps a
 * concurrent writer from interleaving halfway through one, and nothing here
 * ever rewrites a line that already landed.
 */
export async function appendSprintProgress(
  layout: WorkspaceLayout,
  entry: SprintProgressEntry,
): Promise<void> {
  await mkdir(layout.sprintProgressLog, { recursive: true })
  await appendFile(sprintProgressFile(layout, entry.sprintId), `${JSON.stringify(entry)}\n`, 'utf8')
}

export interface SprintProgressReadResult {
  readonly entries: readonly SprintProgressEntry[]
  readonly problems: readonly StoreProblem[]
}

/**
 * Reads one sprint's entries, oldest first.
 *
 * A line that cannot be read is reported rather than skipped, and a last line
 * cut short by an interrupted write is reported as such. Silently dropping
 * either would leave a burndown starting from a baseline nobody can see is
 * incomplete, which is worse than one that refuses to draw.
 */
export async function readSprintProgress(
  layout: WorkspaceLayout,
  sprintId: SprintId,
): Promise<SprintProgressReadResult> {
  const file = sprintProgressFile(layout, sprintId)
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return { entries: [], problems: [] }
  }

  const entries: SprintProgressEntry[] = []
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
      entries.push(decodeEntry(JSON.parse(line)))
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
  return { entries, problems }
}

function decodeEntry(raw: unknown): SprintProgressEntry {
  const record = asRecord(raw, 'sprint progress entry')
  const kind = stringField(record, 'kind')
  if (kind !== 'baseline') {
    throw new ValidationError('this build only reads baseline entries', { kind })
  }
  return {
    kind,
    sprintId: toSprintId(stringField(record, 'sprintId')),
    recordedAt: toTimestamp(stringField(record, 'recordedAt')),
    itemIds: stringArrayField(record, 'itemIds').map(toWorkItemId),
    totalPoints: numberField(record, 'totalPoints'),
    unestimatedCount: numberField(record, 'unestimatedCount'),
  }
}

function problemAt(file: string, line: number, error: unknown): StoreProblem {
  const message = isScrumError(error) ? error.message : (error as Error).message
  return {
    file,
    code: isScrumError(error) ? error.code : 'VALIDATION',
    message: `${file}:${line} ${message}`,
  }
}
