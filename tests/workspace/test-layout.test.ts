import { readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// The runner only executes files matched by the layer globs in
// `vitest.config.ts`, so a test file outside the known layout is silently
// skipped and the run stays green. This guard turns misplacement into a
// failure the run can see.

const repoRoot = join(import.meta.dirname, '..', '..')

/** Layer directories `vitest.config.ts` runs inside each package's `tests/`. */
const PACKAGE_LAYERS = ['unit', 'integration', 'contract']

function testFilesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((path) =>
    path.endsWith('.test.ts'),
  )
}

function layerOf(path: string): string {
  return path.split(sep)[0] ?? ''
}

function packageDirs(): string[] {
  const packagesRoot = join(repoRoot, 'packages')
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((group) =>
      readdirSync(join(packagesRoot, group.name), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((pkg) => join(packagesRoot, group.name, pkg.name)),
    )
}

describe('test files sit where the runner will find them', () => {
  it('keeps every package test inside a configured layer directory', () => {
    const misplaced = packageDirs().flatMap((pkg) => {
      let files: string[]
      try {
        files = testFilesUnder(join(pkg, 'tests'))
      } catch {
        return [] // a package without a tests directory has nothing to misplace
      }
      return files
        .filter((file) => !PACKAGE_LAYERS.includes(layerOf(file)))
        .map((file) => join(pkg, 'tests', file))
    })

    expect(misplaced).toEqual([])
  })

  it('keeps every root test inside the workspace layer', () => {
    const misplaced = testFilesUnder(join(repoRoot, 'tests')).filter(
      (file) => layerOf(file) !== 'workspace',
    )

    expect(misplaced).toEqual([])
  })
})
