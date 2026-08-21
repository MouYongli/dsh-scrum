import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SCRUM_DIRECTORY,
  contains,
  layoutDirectories,
  resolveInside,
  sprintFile,
  workItemFile,
  workspaceLayout,
} from '@dsh-scrum/adapter-storage-workspace-files'
import { ERROR_CODE, isScrumError, toSprintId, toWorkItemId } from '@dsh-scrum/scrum-domain'

const ROOT = resolve('/workspaces/shop')
const LAYOUT = workspaceLayout(ROOT)

function caughtFrom(run: () => unknown): unknown {
  try {
    run()
    return undefined
  } catch (error) {
    return error
  }
}

describe('the workspace layout', () => {
  it('derives every path from the workspace root', () => {
    const scrum = join(ROOT, SCRUM_DIRECTORY)

    expect(LAYOUT).toEqual({
      workspaceRoot: ROOT,
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
    })
  })

  it('normalises a relative or untidy root', () => {
    expect(workspaceLayout(`${ROOT}${sep}nested${sep}..`).workspaceRoot).toBe(ROOT)
    expect(workspaceLayout('.').workspaceRoot).toBe(resolve('.'))
  })

  it('names every directory it has to create, all inside the scrum directory', () => {
    const directories = layoutDirectories(LAYOUT)

    expect(directories).toContain(LAYOUT.scrum)
    expect(directories.every((directory) => contains(LAYOUT.scrum, directory))).toBe(true)
    expect(new Set(directories).size).toBe(directories.length)
  })

  it('places a work item and a sprint file under their own directory', () => {
    expect(workItemFile(LAYOUT, toWorkItemId('SCR-12'))).toBe(join(LAYOUT.workItems, 'SCR-12.json'))
    expect(sprintFile(LAYOUT, toSprintId('sprint-3'))).toBe(join(LAYOUT.sprints, 'sprint-3.json'))
  })
})

describe('containment', () => {
  it('counts a directory as containing itself but not its parent or a sibling', () => {
    expect(contains(ROOT, ROOT)).toBe(true)
    expect(contains(ROOT, join(ROOT, 'a', 'b'))).toBe(true)
    expect(contains(ROOT, resolve('/workspaces'))).toBe(false)
    expect(contains(ROOT, resolve('/workspaces/shop-other'))).toBe(false)
  })
})

describe('resolving inside a directory', () => {
  it('accepts a name that stays put', () => {
    expect(resolveInside(LAYOUT.workItems, 'SCR-1.json')).toBe(join(LAYOUT.workItems, 'SCR-1.json'))
  })

  // The identifiers this store builds names from are already validated, so
  // none of these can reach here today. That is the point: an identifier
  // format loosened later, or a name taken from a directory listing, lands on
  // this guard rather than on readFile.
  it('refuses anything that leaves the directory', () => {
    for (const segment of [
      '../project.json',
      '..',
      'nested/../../escape.json',
      resolve('/etc/passwd'),
    ]) {
      const error = caughtFrom(() => resolveInside(LAYOUT.workItems, segment))
      expect(isScrumError(error) && error.code, `expected ${segment} to be refused`).toBe(
        ERROR_CODE.validation,
      )
    }
  })
})
