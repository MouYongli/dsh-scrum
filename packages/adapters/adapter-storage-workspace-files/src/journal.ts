import { readFile, readdir, rm, unlink } from 'node:fs/promises'
import {
  ConflictError,
  INITIAL_REVISION,
  ValidationError,
  type Timestamp,
} from '@dsh-scrum/scrum-domain'
import { writeFileAtomically } from './atomic.js'
import { arrayField, asRecord, decodingFile, numberField, stringField } from './json.js'
import { realPathInside, resolveInside, type WorkspaceLayout } from './paths.js'
import { NEW_ENTITY, readStoredRevision, type WriteExpectation } from './writes.js'

const JOURNAL_SCHEMA_VERSION = 1

/** One file an operation intends to replace. */
export interface OperationWrite {
  readonly file: string
  readonly content: unknown
  readonly expected: WriteExpectation
}

export interface OperationSpec {
  /**
   * Supplied by the caller and stable for one logical operation, so retrying
   * after a crash resumes the same journal instead of starting a second one.
   */
  readonly id: string
  /** What was being done, carried only so a recovered operation can be explained. */
  readonly kind: string
  readonly at: Timestamp
  readonly writes: readonly OperationWrite[]
}

/** What a journal holds: enough to finish the operation, or to undo it. */
interface JournalEntry {
  readonly file: string
  readonly after: string
  readonly before: string | null
}

export interface RecoveredOperation {
  readonly id: string
  readonly kind: string
  readonly files: readonly string[]
}

/**
 * Applies several writes as one operation.
 *
 * Every revision is checked and every previous content captured before
 * anything is written, so a stale read fails while the store is still
 * untouched. The journal is then written atomically — it exists in full or not
 * at all — and only afterwards do the targets change. That ordering is what
 * makes a crash recoverable: a journal on disk means the operation was
 * decided, so recovery finishes it rather than guessing.
 *
 * A failure while applying rolls back here, where the previous contents are
 * still known, rather than leaving it for a recovery pass that would have to
 * infer what happened.
 */
export async function runOperation(layout: WorkspaceLayout, spec: OperationSpec): Promise<void> {
  if (spec.writes.length === 0) {
    throw new ValidationError('an operation must write something', { operationId: spec.id })
  }
  const entries = await prepareEntries(layout, spec)
  const journal = journalFile(layout, spec.id)

  await writeFileAtomically(
    journal,
    `${JSON.stringify(
      {
        schemaVersion: JOURNAL_SCHEMA_VERSION,
        id: spec.id,
        kind: spec.kind,
        startedAt: spec.at,
        entries,
      },
      null,
      2,
    )}\n`,
    'journal',
  )

  const applied: JournalEntry[] = []
  try {
    for (const entry of entries) {
      await writeFileAtomically(entry.file, entry.after, spec.id)
      applied.push(entry)
    }
  } catch (error) {
    await rollback(applied)
    await remove(journal)
    throw error
  }
  await remove(journal)
}

async function prepareEntries(
  layout: WorkspaceLayout,
  spec: OperationSpec,
): Promise<readonly JournalEntry[]> {
  const entries: JournalEntry[] = []
  for (const write of spec.writes) {
    await realPathInside(layout.workspaceRoot, write.file)
    const stored = await readStoredRevision(write.file)

    if (write.expected === NEW_ENTITY) {
      if (stored !== null) {
        throw new ConflictError('the entity already exists', INITIAL_REVISION, stored, {
          file: write.file,
        })
      }
    } else if (stored === null) {
      throw new ConflictError('the entity is no longer there', write.expected, 0, {
        file: write.file,
      })
    } else if (stored !== write.expected) {
      throw new ConflictError('the entity changed since it was read', write.expected, stored, {
        file: write.file,
      })
    }

    entries.push({
      file: write.file,
      after: `${JSON.stringify(write.content, null, 2)}\n`,
      before: stored === null ? null : await readFile(write.file, 'utf8'),
    })
  }
  return entries
}

/**
 * Puts back what was there. A file that did not exist is removed rather than
 * left holding a value nothing ever agreed to.
 */
async function rollback(applied: readonly JournalEntry[]): Promise<void> {
  for (const entry of [...applied].reverse()) {
    if (entry.before === null) {
      await remove(entry.file)
    } else {
      await writeFileAtomically(entry.file, entry.before, 'rollback')
    }
  }
}

/**
 * Finishes operations interrupted by a crash.
 *
 * Rolls forward rather than back. The journal reached disk before any target
 * did, so its presence means the operation was already decided; undoing it
 * would discard a decision the user made, while completing it is what they
 * asked for.
 *
 * Running this twice changes nothing: a file already holding its target
 * content is skipped, and the journal is gone after the first pass. An
 * interruption partway through leaves the journal in place, so the next pass
 * finishes the rest.
 */
export async function recoverOperations(
  layout: WorkspaceLayout,
): Promise<readonly RecoveredOperation[]> {
  const recovered: RecoveredOperation[] = []
  for (const name of await pendingJournals(layout)) {
    const file = resolveInside(layout.pendingOperations, name)
    const text = await readFile(file, 'utf8')
    const journal = decodingFile(file, () => parseJournal(JSON.parse(text)))
    const files: string[] = []
    for (const entry of journal.entries) {
      await realPathInside(layout.workspaceRoot, entry.file)
      if (await differs(entry)) {
        await writeFileAtomically(entry.file, entry.after, `recover-${journal.id}`)
        files.push(entry.file)
      }
    }
    await remove(file)
    recovered.push({ id: journal.id, kind: journal.kind, files })
  }
  return recovered
}

async function differs(entry: JournalEntry): Promise<boolean> {
  try {
    return (await readFile(entry.file, 'utf8')) !== entry.after
  } catch {
    return true
  }
}

async function pendingJournals(layout: WorkspaceLayout): Promise<readonly string[]> {
  try {
    return (await readdir(layout.pendingOperations)).filter((name) => name.endsWith('.json')).sort()
  } catch {
    return []
  }
}

interface Journal {
  readonly id: string
  readonly kind: string
  readonly entries: readonly JournalEntry[]
}

function parseJournal(raw: unknown): Journal {
  const record = asRecord(raw, 'operation journal')
  const schemaVersion = numberField(record, 'schemaVersion')
  if (schemaVersion !== JOURNAL_SCHEMA_VERSION) {
    throw new ValidationError('the operation journal was written by another version', {
      schemaVersion,
      supportedVersion: JOURNAL_SCHEMA_VERSION,
    })
  }
  return {
    id: stringField(record, 'id'),
    kind: stringField(record, 'kind'),
    entries: arrayField(record, 'entries').map((entry, index) => {
      const item = asRecord(entry, `entries[${index}]`)
      return {
        file: stringField(item, 'file'),
        after: stringField(item, 'after'),
        before: item['before'] === null ? null : stringField(item, 'before'),
      }
    }),
  }
}

function journalFile(layout: WorkspaceLayout, id: string): string {
  return resolveInside(layout.pendingOperations, `${id}.json`)
}

async function remove(file: string): Promise<void> {
  try {
    await unlink(file)
  } catch {
    await rm(file, { force: true })
  }
}
