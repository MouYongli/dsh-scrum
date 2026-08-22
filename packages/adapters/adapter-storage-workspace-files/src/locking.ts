import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { ConflictError } from '@dsh-scrum/scrum-domain'

/** A held lock. Releasing twice is harmless, so a `finally` can always call it. */
export interface WorkspaceLock {
  release(): Promise<void>
}

/**
 * How a workspace is locked across processes.
 *
 * A port rather than a concrete lock, because the mechanism that works for a
 * local directory is not the one that works for a network share or a future
 * remote store. Nothing above this cares which is in use.
 */
export interface FileLockPort {
  acquire(lockPath: string): Promise<WorkspaceLock>
}

/** Who holds a lock, written for diagnostics rather than for correctness. */
export interface LockHolder {
  readonly pid: number
  readonly host: string
  readonly acquiredAt: number
}

export interface DirectoryLockOptions {
  /** How long to keep trying before giving up. */
  readonly timeoutMs?: number
  /** How long between attempts. */
  readonly retryDelayMs?: number
  /** After this, a lock is assumed abandoned by a process that died holding it. */
  readonly staleAfterMs?: number
  readonly now?: () => number
}

const DEFAULTS = {
  timeoutMs: 5_000,
  retryDelayMs: 25,
  staleAfterMs: 30_000,
}

/**
 * A lock built on directory creation.
 *
 * `mkdir` either creates the directory or fails, with no window in between,
 * on every filesystem this has to work on. A lock file written with `wx` would
 * do as well locally but is less reliable over a network share, which is the
 * case a workspace on a synced folder actually hits.
 *
 * A lock older than the stale threshold is broken rather than waited on. A
 * process that dies holding one leaves nothing behind that can clean it up,
 * and a workspace that stays locked until someone deletes a hidden directory
 * is worse than the rare double write breaking it early risks.
 */
export function createDirectoryLockPort(options: DirectoryLockOptions = {}): FileLockPort {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs
  const retryDelayMs = options.retryDelayMs ?? DEFAULTS.retryDelayMs
  const staleAfterMs = options.staleAfterMs ?? DEFAULTS.staleAfterMs
  const now = options.now ?? Date.now

  return {
    async acquire(lockPath: string): Promise<WorkspaceLock> {
      const deadline = now() + timeoutMs
      for (;;) {
        if (await tryCreate(lockPath, now())) {
          return { release: () => release(lockPath) }
        }
        if (await breakIfStale(lockPath, now(), staleAfterMs)) {
          continue
        }
        if (now() >= deadline) {
          throw new ConflictError('another process is writing to this workspace', 0, 0, {
            lockPath,
            holder: describeHolder(await readHolder(lockPath)),
          })
        }
        await delay(retryDelayMs)
      }
    },
  }
}

async function tryCreate(lockPath: string, acquiredAt: number): Promise<boolean> {
  try {
    await mkdir(lockPath)
  } catch (error) {
    if (hasCode(error, 'EEXIST')) {
      return false
    }
    throw error
  }
  const holder: LockHolder = { pid: process.pid, host: hostname(), acquiredAt }
  await writeFile(join(lockPath, 'holder.json'), JSON.stringify(holder), 'utf8')
  return true
}

/**
 * The age is taken from the directory itself, not from the holder record.
 * A lock whose record failed to write is exactly the abandoned case, so
 * trusting the record would make the unreadable lock the one nothing breaks.
 */
async function breakIfStale(
  lockPath: string,
  currentTime: number,
  staleAfterMs: number,
): Promise<boolean> {
  let age: number
  try {
    age = currentTime - (await stat(lockPath)).mtimeMs
  } catch (error) {
    // Gone between the failed create and now: whoever held it just released.
    return hasCode(error, 'ENOENT')
  }
  if (age < staleAfterMs) {
    return false
  }
  await release(lockPath)
  return true
}

async function readHolder(lockPath: string): Promise<LockHolder | null> {
  try {
    return JSON.parse(await readFile(join(lockPath, 'holder.json'), 'utf8')) as LockHolder
  } catch {
    return null
  }
}

/** A holder as one line, so the refusal says who to go and look at. */
function describeHolder(holder: LockHolder | null): string {
  return holder === null ? 'unknown' : `pid ${holder.pid} on ${holder.host}`
}

async function release(lockPath: string): Promise<void> {
  await rm(lockPath, { recursive: true, force: true })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === code
}
