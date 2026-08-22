import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  TEMPORARY_SUFFIX,
  removeTemporaryFiles,
  temporaryFileFor,
  writeFileAtomically,
} from '@dsh-scrum/adapter-storage-workspace-files'
import { ERROR_CODE, isScrumError } from '@dsh-scrum/scrum-domain'

let directory: string
let target: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dsh-scrum-atomic-'))
  target = join(directory, 'SCR-1.json')
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

/** Large enough that a truncating write is observably torn rather than lucky. */
function payload(marker: string): string {
  return JSON.stringify({ marker, filler: marker.repeat(200_000) })
}

async function caughtFrom(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
    return undefined
  } catch (error) {
    return error
  }
}

describe('replacing a file atomically', () => {
  it('writes the content and leaves nothing behind', async () => {
    await writeFileAtomically(target, '{"a":1}', 'new')

    expect(await readFile(target, 'utf8')).toBe('{"a":1}')
    expect(await readdir(directory)).toEqual(['SCR-1.json'])
  })

  it('replaces existing content', async () => {
    await writeFileAtomically(target, '{"a":1}', '1')
    await writeFileAtomically(target, '{"a":2}', '2')

    expect(await readFile(target, 'utf8')).toBe('{"a":2}')
    expect(await readdir(directory)).toEqual(['SCR-1.json'])
  })

  // The property the whole mechanism exists for. A reader running alongside a
  // writer must never observe a mixture of the two contents — which is exactly
  // what a truncating write produces, and what a crash mid-write would leave
  // on disk. Reading concurrently is the closest a test can get to crashing at
  // an arbitrary point.
  it('never lets a reader observe a partially written file', async () => {
    const first = payload('a')
    const second = payload('b')
    await writeFileAtomically(target, first, 'seed')

    let writing = true
    const writer = (async () => {
      for (let round = 0; round < 40; round += 1) {
        await writeFileAtomically(target, round % 2 === 0 ? second : first, `w${round}`)
      }
      writing = false
    })()

    // Both payloads are the same length, so identity is what gets recorded:
    // counting lengths would report one observation however often it changed.
    const observed = new Set<string>()
    while (writing) {
      const seen = await readFile(target, 'utf8')
      expect(seen === first || seen === second).toBe(true)
      observed.add(seen === first ? 'first' : 'second')
    }
    await writer

    // If the loop only ever caught one state the assertion above proved
    // nothing, so require it to have seen the file change under it.
    expect(observed.size).toBeGreaterThan(1)
  })

  it('refuses a second write that stakes out the same name', async () => {
    await writeFile(temporaryFileFor(target, '3'), 'half written', 'utf8')

    const error = await caughtFrom(() => writeFileAtomically(target, '{"a":1}', '3'))

    expect(isScrumError(error) && error.code).toBe(ERROR_CODE.validation)
    // The loser must not have touched the target.
    await expect(readFile(target, 'utf8')).rejects.toThrow(/ENOENT/)
  })

  // A collision is a specific answer, so a failure that is not one must not be
  // reported as one: a missing directory would otherwise look like contention.
  it('passes through a failure that is not a collision', async () => {
    const error = await caughtFrom(() =>
      writeFileAtomically(join(directory, 'missing', 'SCR-1.json'), '{}', '1'),
    )

    expect(isScrumError(error)).toBe(false)
    expect(String(error)).toMatch(/ENOENT/)
  })

  it('allows a write once the colliding name is free again', async () => {
    await writeFile(temporaryFileFor(target, '3'), 'half written', 'utf8')
    await removeTemporaryFiles(directory)

    await writeFileAtomically(target, '{"a":1}', '3')
    expect(await readFile(target, 'utf8')).toBe('{"a":1}')
  })
})

describe('a write that fails at the rename', () => {
  // The rename is the only step that can fail after the temporary file exists,
  // so it is the only way a leftover can outlive the call that made it.
  it('removes the temporary file and leaves the target alone', async () => {
    const blocked = join(directory, 'blocked.json')
    await mkdir(blocked)
    await writeFile(join(blocked, 'keep.txt'), 'occupied', 'utf8')

    await expect(writeFileAtomically(blocked, '{"a":1}', '1')).rejects.toThrow()

    expect((await readdir(directory)).sort()).toEqual(['blocked.json'])
    expect(await readdir(blocked)).toEqual(['keep.txt'])
  })
})

describe('leftovers from an interrupted write', () => {
  it('names them so nothing mistakes one for data', () => {
    const temporary = temporaryFileFor(target, '7')

    expect(temporary.endsWith(TEMPORARY_SUFFIX)).toBe(true)
    expect(temporary.endsWith('.json')).toBe(false)
    expect(temporary.startsWith(directory)).toBe(true)
  })

  it('clears them and leaves real files alone', async () => {
    await writeFileAtomically(target, '{"a":1}', '1')
    await writeFile(temporaryFileFor(target, '2'), 'half written', 'utf8')
    await writeFile(temporaryFileFor(join(directory, 'SCR-2.json'), 'new'), 'half', 'utf8')

    const removed = await removeTemporaryFiles(directory)

    expect(removed).toHaveLength(2)
    expect(await readdir(directory)).toEqual(['SCR-1.json'])
  })

  it('reports nothing for a directory that is not there', async () => {
    expect(await removeTemporaryFiles(join(directory, 'missing'))).toEqual([])
  })
})
