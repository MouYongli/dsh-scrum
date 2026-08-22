import { mkdir, mkdtemp, readdir, rm, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createDirectoryLockPort,
  createWriteCoordinator,
  workspaceLayout,
  type WorkspaceLayout,
} from '@dsh-scrum/adapter-storage-workspace-files'
import { ERROR_CODE, isScrumError } from '@dsh-scrum/scrum-domain'

let root: string
let layout: WorkspaceLayout

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-scrum-lock-'))
  layout = workspaceLayout(root)
  await mkdir(layout.scrum, { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function caughtFrom(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
    return undefined
  } catch (error) {
    return error
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('the workspace lock', () => {
  it('is held by one holder at a time and released afterwards', async () => {
    const port = createDirectoryLockPort({ timeoutMs: 50, retryDelayMs: 5 })

    const held = await port.acquire(layout.lock)
    expect((await stat(layout.lock)).isDirectory()).toBe(true)

    const error = await caughtFrom(() => port.acquire(layout.lock))
    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.conflict)

    await held.release()
    const second = await port.acquire(layout.lock)
    await second.release()
    expect(await readdir(layout.scrum)).toEqual([])
  })

  it('names who is holding it, so the refusal points somewhere', async () => {
    const port = createDirectoryLockPort({ timeoutMs: 20, retryDelayMs: 5 })
    const held = await port.acquire(layout.lock)

    const error = await caughtFrom(() => port.acquire(layout.lock))
    expect(isScrumError(error) && String(error.details['holder'])).toContain(String(process.pid))

    await held.release()
  })

  // A process that dies holding the lock leaves nothing behind that can clean
  // it up. A workspace that stays locked until somebody deletes a hidden
  // directory by hand is worse than breaking an abandoned lock early.
  it('breaks a lock left behind by a process that died', async () => {
    const port = createDirectoryLockPort({ timeoutMs: 50, retryDelayMs: 5, staleAfterMs: 1_000 })
    await port.acquire(layout.lock)

    const longAgo = new Date(Date.now() - 60_000)
    await utimes(layout.lock, longAgo, longAgo)

    const stolen = await port.acquire(layout.lock)
    await stolen.release()
  })

  // A lock whose holder record never got written is exactly the abandoned
  // case, so age has to come from the directory rather than the record.
  it('breaks an abandoned lock that has no readable holder record', async () => {
    const port = createDirectoryLockPort({ timeoutMs: 50, retryDelayMs: 5, staleAfterMs: 1_000 })
    await mkdir(layout.lock)
    const longAgo = new Date(Date.now() - 60_000)
    await utimes(layout.lock, longAgo, longAgo)

    const taken = await port.acquire(layout.lock)
    await taken.release()
  })

  it('waits for a lock that is released while it is trying', async () => {
    const port = createDirectoryLockPort({ timeoutMs: 2_000, retryDelayMs: 5 })
    const held = await port.acquire(layout.lock)

    const waiting = port.acquire(layout.lock)
    await delay(30)
    await held.release()

    await (await waiting).release()
  })
})

describe('the write coordinator', () => {
  it('runs one piece of work at a time', async () => {
    const coordinator = createWriteCoordinator(layout, createDirectoryLockPort({ retryDelayMs: 2 }))
    const events: string[] = []

    const work = (name: string) => async () => {
      events.push(`${name} in`)
      await delay(5)
      events.push(`${name} out`)
      return name
    }

    const results = await Promise.all([
      coordinator.run(work('a')),
      coordinator.run(work('b')),
      coordinator.run(work('c')),
    ])

    expect(results).toEqual(['a', 'b', 'c'])
    // Interleaving would show as an "in" arriving before the previous "out".
    expect(events).toEqual(['a in', 'a out', 'b in', 'b out', 'c in', 'c out'])
  })

  // A failure must not take the queue down with it, or one bad write makes
  // every later write in the session fail for a reason that has nothing to do
  // with it.
  it('keeps running after a piece of work throws', async () => {
    const coordinator = createWriteCoordinator(layout, createDirectoryLockPort({ retryDelayMs: 2 }))

    const failure = caughtFrom(() =>
      coordinator.run(() => Promise.reject(new Error('write failed'))),
    )
    const after = coordinator.run(() => Promise.resolve('still working'))

    expect(String(await failure)).toContain('write failed')
    expect(await after).toBe('still working')
    expect(await readdir(layout.scrum)).toEqual([])
  })

  // Two coordinators standing in for two Harness windows on one workspace.
  // They share no memory, so only the file lock keeps them apart.
  it('serialises two coordinators that share nothing but the directory', async () => {
    const first = createWriteCoordinator(layout, createDirectoryLockPort({ retryDelayMs: 2 }))
    const second = createWriteCoordinator(layout, createDirectoryLockPort({ retryDelayMs: 2 }))
    let inside = 0
    let overlapped = false

    const work = async () => {
      inside += 1
      if (inside > 1) overlapped = true
      await delay(5)
      inside -= 1
    }

    await Promise.all([first.run(work), second.run(work), first.run(work), second.run(work)])

    expect(overlapped).toBe(false)
  })
})
