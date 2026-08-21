import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { realPathInside, workspaceLayout } from '@dsh-scrum/adapter-storage-workspace-files'
import { ERROR_CODE, isScrumError } from '@dsh-scrum/scrum-domain'

let root: string
let outside: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-scrum-root-'))
  outside = await mkdtemp(join(tmpdir(), 'dsh-scrum-outside-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

async function caughtFrom(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
    return undefined
  } catch (error) {
    return error
  }
}

describe('resolving real paths inside a workspace', () => {
  // On macOS the temporary directory is itself reached through a link, so a
  // check that resolved only the target would reject every legitimate path.
  // This test fails on that platform if the root stops being resolved too.
  it('accepts a path under a workspace root that is itself a link', async () => {
    const layout = workspaceLayout(root)
    await mkdir(layout.workItems, { recursive: true })
    const target = join(layout.workItems, 'SCR-1.json')
    await writeFile(target, '{}', 'utf8')

    expect(await realPathInside(root, target)).toBe(await realPathInside(root, target))
    expect(await realPathInside(root, layout.scrum)).toContain('.scrum')
  })

  it('refuses a file that is a link out of the workspace', async () => {
    const layout = workspaceLayout(root)
    await mkdir(layout.workItems, { recursive: true })
    const secret = join(outside, 'secret.json')
    await writeFile(secret, '{"stolen":true}', 'utf8')
    const planted = join(layout.workItems, 'SCR-9.json')
    await symlink(secret, planted)

    const error = await caughtFrom(() => realPathInside(root, planted))
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
  })

  // A linked directory is the harder case: every file under it has a path that
  // looks perfectly ordinary, so only resolving the directory catches it.
  it('refuses a file inside a directory that is a link out of the workspace', async () => {
    const layout = workspaceLayout(root)
    await mkdir(layout.scrum, { recursive: true })
    await mkdir(join(outside, 'work-items'), { recursive: true })
    await writeFile(join(outside, 'work-items', 'SCR-9.json'), '{}', 'utf8')
    await symlink(join(outside, 'work-items'), layout.workItems)

    const error = await caughtFrom(() => realPathInside(root, join(layout.workItems, 'SCR-9.json')))
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
  })

  // Writing needs the same guard as reading, and the file is not there yet.
  it('guards a path that does not exist yet through its parent', async () => {
    const layout = workspaceLayout(root)
    await mkdir(layout.workItems, { recursive: true })
    const target = join(layout.workItems, 'SCR-2.json')

    expect(await realPathInside(root, target)).toMatch(/SCR-2\.json$/)

    await symlink(outside, join(layout.scrum, 'sprints'))
    const error = await caughtFrom(() =>
      realPathInside(root, join(layout.scrum, 'sprints', 'sprint-1.json')),
    )
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
  })

  it('refuses a path that was never under the workspace', async () => {
    const error = await caughtFrom(() => realPathInside(root, resolve(outside, 'anything.json')))
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
  })
})
