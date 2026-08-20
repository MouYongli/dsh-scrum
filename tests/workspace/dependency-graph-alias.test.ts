import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// `tsconfig.depcruise.json` maps every workspace specifier to its sources so
// that `pnpm lint:deps` sees a package-name import at all. A specifier missing
// from that map resolves into `dist` instead, where no `src`-based boundary
// rule can match it — the rule stays green while enforcing nothing. That is
// the failure this file exists to prevent: the map has to name every specifier
// a package actually publishes, and nothing else.

interface PackageManifest {
  name: string
  exports?: Record<string, string | Record<string, string>>
}

interface DepcruiseTsConfig {
  compilerOptions: { paths: Record<string, string[]> }
}

const { compilerOptions } = JSON.parse(
  readFileSync('tsconfig.depcruise.json', 'utf8'),
) as DepcruiseTsConfig

function workspaceManifests(): PackageManifest[] {
  const manifests: PackageManifest[] = []
  for (const group of readdirSync('packages')) {
    for (const name of readdirSync(join('packages', group))) {
      manifests.push(
        JSON.parse(
          readFileSync(join('packages', group, name, 'package.json'), 'utf8'),
        ) as PackageManifest,
      )
    }
  }
  return manifests
}

/**
 * The specifiers that reach code. A subpath serving a data file — the manifest
 * the module loader reads, the Cordis patch the profile composer reads — is
 * deliberately left unaliased: it has no source form to resolve to.
 */
function codeSpecifiers(manifest: PackageManifest): string[] {
  const specifiers: string[] = []
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    const file = typeof target === 'string' ? target : (target['default'] ?? '')
    if (!file.endsWith('.js')) continue
    specifiers.push(subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`)
  }
  return specifiers
}

const EXPECTED = workspaceManifests().flatMap(codeSpecifiers).sort()

describe('dependency graph alias map', () => {
  it('covers every specifier a workspace package exports, and no others', () => {
    expect(Object.keys(compilerOptions.paths).sort()).toEqual(EXPECTED)
  })

  it.each(Object.entries(compilerOptions.paths))(
    '%s points at a source file',
    (_specifier, [target]) => {
      expect(target).toMatch(/^\.\/packages\/[^/]+\/[^/]+\/src\/.*\.ts$/)
      expect(existsSync(target as string)).toBe(true)
    },
  )
})
