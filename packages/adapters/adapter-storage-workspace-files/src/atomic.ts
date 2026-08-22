import { open, readdir, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { ValidationError } from '@dsh-scrum/scrum-domain'

/**
 * Suffix marking a half-written file.
 *
 * It deliberately does not end in `.json`, so the directory scan skips a
 * leftover without having to know anything about how writes work. A temporary
 * file that could be mistaken for data is the failure this naming prevents.
 */
export const TEMPORARY_SUFFIX = '.tmp'

/**
 * The name a write stakes out before it starts.
 *
 * The token is part of the name rather than something random, so two writers
 * that read the same revision collide here instead of both proceeding. That
 * turns the most common form of the lost update into a failed create, using
 * only the filesystem's own atomicity. It narrows the race rather than closing
 * it: a writer that reads while another is mid-rename still sees the older
 * revision, and serialising that is the write coordinator's job.
 */
export function temporaryFileFor(file: string, token: string): string {
  return join(dirname(file), `${basename(file)}.${token}${TEMPORARY_SUFFIX}`)
}

/**
 * Replaces a file's contents so that a reader sees either all of the old
 * content or all of the new one, never a mixture.
 *
 * The temporary file lives in the same directory because a rename is only
 * atomic within one filesystem, and a sibling directory can be a mount point.
 * The data is flushed before the rename, so a crash cannot leave the rename
 * committed while the bytes it points at are still in a write buffer.
 *
 * `wx` on the temporary file is what makes a colliding write fail rather than
 * quietly share a scratch file with another writer.
 */
export async function writeFileAtomically(
  file: string,
  content: string,
  token: string,
): Promise<void> {
  const temporary = temporaryFileFor(file, token)
  let handle
  try {
    handle = await open(temporary, 'wx')
  } catch (error) {
    if (hasCode(error, 'EEXIST')) {
      throw new ValidationError('another write to this file is already in progress', {
        file,
        token,
      })
    }
    throw error
  }

  try {
    await handle.writeFile(content, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }

  try {
    await rename(temporary, file)
  } catch (error) {
    await remove(temporary)
    throw error
  }
  await syncDirectory(dirname(file))
}

/**
 * Flushes the rename itself.
 *
 * Without this the directory entry can still be in a buffer after the call
 * returns, so a crash could lose a write that already reported success. Not
 * every platform lets a directory be opened this way, and where it does not
 * the rename is durable by other means, so a refusal here is not a failure of
 * the write.
 */
async function syncDirectory(directory: string): Promise<void> {
  let handle
  try {
    handle = await open(directory, 'r')
  } catch {
    return
  }
  try {
    await handle.sync()
  } catch {
    // Platform does not support syncing a directory handle.
  } finally {
    await handle.close()
  }
}

/**
 * Clears temporary files left by a write that never finished.
 *
 * The scan already ignores them, so this is housekeeping rather than
 * correctness: without it an interrupted write leaves litter that accumulates
 * and eventually blocks the retry that would have replaced it.
 */
export async function removeTemporaryFiles(directory: string): Promise<readonly string[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return []
    }
    throw error
  }
  const removed: string[] = []
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(TEMPORARY_SUFFIX)) {
      await remove(join(directory, entry.name))
      removed.push(entry.name)
    }
  }
  return removed
}

async function remove(file: string): Promise<void> {
  try {
    await unlink(file)
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) {
      throw error
    }
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === code
}
