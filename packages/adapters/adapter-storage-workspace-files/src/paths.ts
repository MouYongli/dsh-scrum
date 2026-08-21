import { realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
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
  readonly pendingOperations: string
  readonly attachments: string
  readonly backups: string
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
    pendingOperations: join(scrum, 'operations', 'pending'),
    attachments: join(scrum, 'attachments'),
    backups: join(scrum, 'backups'),
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

async function realPathOf(target: string): Promise<string> {
  try {
    return await realpath(target)
  } catch {
    // Not there yet. Its parent has to exist for a write to be possible at
    // all, and resolving that is what catches a linked directory.
    return join(await realpath(dirname(target)), target.slice(dirname(target).length + 1))
  }
}
