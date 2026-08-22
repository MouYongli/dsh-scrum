import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { ValidationError, type SprintId, type WorkItemId } from '@dsh-scrum/scrum-domain'

/** Directory holding the authoritative Scrum data inside a workspace. */
export const SCRUM_DIRECTORY = '.scrum'

/**
 * Every path the store reads or writes, derived once from the workspace root.
 *
 * Deriving them in one place is what keeps the layout a single fact. A caller
 * that joined its own path would be a second definition of where data lives,
 * and the two would drift the first time the layout changed.
 */
export interface WorkspaceLayout {
  readonly workspaceRoot: string
  readonly scrum: string
  readonly project: string
  readonly config: string
  readonly workItems: string
  readonly sprints: string
  readonly comments: string
  readonly activities: string
  readonly sessions: string
  /**
   * Where this workspace records which project it is attached to, per Harness
   * installation. The project itself says what it is; the binding also has to
   * remember where the workspace was when it was attached, which nothing else
   * on disk can answer.
   */
  readonly bindings: string
  /** Completed operations remembered by the key their caller supplied. */
  readonly idempotency: string
  readonly pendingOperations: string
  readonly attachments: string
  readonly backups: string
  /** Held while a write is in progress. A directory, so creating it is the lock. */
  readonly lock: string
}

export function workspaceLayout(workspaceRoot: string): WorkspaceLayout {
  const root = resolve(workspaceRoot)
  const scrum = join(root, SCRUM_DIRECTORY)
  return {
    workspaceRoot: root,
    scrum,
    project: join(scrum, 'project.json'),
    config: join(scrum, 'config.json'),
    workItems: join(scrum, 'work-items'),
    sprints: join(scrum, 'sprints'),
    comments: join(scrum, 'comments'),
    activities: join(scrum, 'activities'),
    sessions: join(scrum, 'sessions'),
    bindings: join(scrum, 'bindings'),
    idempotency: join(scrum, 'idempotency'),
    pendingOperations: join(scrum, 'operations', 'pending'),
    attachments: join(scrum, 'attachments'),
    backups: join(scrum, 'backups'),
    lock: join(scrum, 'workspace.lock'),
  }
}

/** The directories `initialiseProject` creates, in the order it creates them. */
export function layoutDirectories(layout: WorkspaceLayout): readonly string[] {
  return [
    layout.scrum,
    layout.workItems,
    layout.sprints,
    layout.comments,
    layout.activities,
    layout.sessions,
    layout.bindings,
    layout.idempotency,
    layout.pendingOperations,
    layout.attachments,
    layout.backups,
  ]
}

export function workItemFile(layout: WorkspaceLayout, id: WorkItemId): string {
  return resolveInside(layout.workItems, `${id}.json`)
}

export function sprintFile(layout: WorkspaceLayout, id: SprintId): string {
  return resolveInside(layout.sprints, `${id}.json`)
}

/**
 * A filename that stands for an opaque reference without spelling it out.
 *
 * `.scrum/` is committed to the user's repository as often as not, and a
 * Harness instance id or a caller's idempotency key would then sit in a
 * directory listing and in every diff that touches it. A digest still answers
 * the only question a filename is asked — whether this is the same reference —
 * and the file's own contents carry whatever the reader has to compare.
 */
export function digestFileName(reference: string): string {
  return `${createHash('sha256').update(reference).digest('hex')}.json`
}

/** Whether `child` is `parent` itself or sits somewhere beneath it. */
export function contains(parent: string, child: string): boolean {
  const step = relative(parent, child)
  return step === '' || (!step.startsWith(`..${sep}`) && step !== '..' && !isAbsolute(step))
}

/**
 * Joins a relative path onto a directory and refuses anything that leaves it.
 *
 * The identifiers this store builds file names from are already validated, so
 * this is not the only thing standing between a crafted id and the rest of the
 * disk. It is the thing that keeps it that way: an identifier format loosened
 * later, or a name taken from a directory listing, arrives here rather than at
 * `readFile`.
 */
export function resolveInside(directory: string, ...segments: readonly string[]): string {
  const target = resolve(directory, ...segments)
  if (!contains(directory, target)) {
    throw new ValidationError('path escapes the directory it must stay inside', {
      directory,
      segments: [...segments],
    })
  }
  return target
}

/**
 * The same guarantee once symbolic links are followed.
 *
 * The lexical check above cannot see a link: `.scrum/work-items/x.json` is
 * inside the workspace by every string comparison even when it points at
 * `/etc/passwd`. Both sides are resolved because a workspace root is itself
 * frequently a link — on macOS `/tmp` is one — and comparing a real path
 * against an unresolved root rejects every legitimate path under it.
 *
 * A target that does not exist yet resolves through its parent, so this can
 * guard a write as well as a read.
 */
export async function realPathInside(root: string, target: string): Promise<string> {
  const realRoot = await realpath(root)
  const realTarget = await realPathOf(target)
  if (!contains(realRoot, realTarget)) {
    throw new ValidationError('path resolves outside the workspace', { root, target })
  }
  return realTarget
}

/**
 * The real path of something that may not exist yet.
 *
 * Walks up to the nearest ancestor that does exist, resolves that, and puts
 * the missing segments back. Resolving only the immediate parent is not
 * enough: an unbound workspace has no `.scrum` directory either, so the parent
 * is missing too and the caller would get a raw filesystem error instead of
 * the answer that the project is simply not there.
 */
async function realPathOf(target: string): Promise<string> {
  const missing: string[] = []
  let current = target
  for (;;) {
    try {
      return join(await realpath(current), ...[...missing].reverse())
    } catch {
      const parent = dirname(current)
      if (parent === current) {
        // Nothing along the whole chain exists, including the root itself.
        return resolve(target)
      }
      missing.push(basename(current))
      current = parent
    }
  }
}
