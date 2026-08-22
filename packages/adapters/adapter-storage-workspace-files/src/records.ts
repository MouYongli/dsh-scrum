import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { decodingFile, asRecord, type JsonRecord } from './json.js'
import { writeFileAtomically } from './atomic.js'

/** Serialises one write against every other write to the same workspace. */
export type Run = <Value>(work: () => Promise<Value>) => Promise<Value>

/** Version of the small records this adapter writes beside the entities. */
export const RECORD_SCHEMA_VERSION = 1

/**
 * Reads one JSON file, answering `null` only for a file that is not there.
 *
 * A file that exists but cannot be read is reported. The two are different
 * problems: one means the entity does not exist, the other means something is
 * wrong with the store, and answering `null` for both would let a corrupted
 * work item look like a deleted one.
 */
export async function readJsonFile(file: string): Promise<JsonRecord | null> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
  return decodingFile(file, () => asRecord(JSON.parse(text), 'file'))
}

export async function readEntity<Value>(
  file: string,
  decode: (value: unknown) => Value,
): Promise<Value | null> {
  const record = await readJsonFile(file)
  return record === null ? null : decodingFile(file, () => decode(record))
}

/** Writes one small record, serialised by the coordinator that called us. */
export async function writeRecord(file: string, content: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFileAtomically(file, `${JSON.stringify(content, null, 2)}\n`, 'record')
}
