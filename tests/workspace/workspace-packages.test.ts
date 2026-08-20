import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageManifest {
  name: string
  private?: boolean
  dependencies?: Record<string, string>
  exports?: Record<string, Record<string, string> | string>
  scripts?: Record<string, string>
}

function workspacePackages(): Array<{ dir: string; manifest: PackageManifest }> {
  const packages: Array<{ dir: string; manifest: PackageManifest }> = []
  for (const group of readdirSync('packages')) {
    for (const name of readdirSync(join('packages', group))) {
      const dir = join('packages', group, name)
      packages.push({
        dir,
        manifest: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageManifest,
      })
    }
  }
  return packages
}

const PACKAGES = workspacePackages()

describe('workspace package contract', () => {
  it.each(PACKAGES)('$dir is a private @dsh-scrum package', ({ manifest }) => {
    expect(manifest.name).toMatch(/^@dsh-scrum\//)
    expect(manifest.private).toBe(true)
  })

  it.each(PACKAGES)('$dir exposes the same entry point shape', ({ manifest }) => {
    expect(manifest.exports?.['.']).toEqual({
      types: './dist/index.d.ts',
      default: './dist/index.js',
    })
  })

  // The harness loader reads a package's own manifest to locate its browser
  // artifact and silently skips the plugin when this export is missing.
  it.each(PACKAGES)('$dir exports its own manifest', ({ manifest }) => {
    expect(manifest.exports?.['./package.json']).toBe('./package.json')
  })

  it.each(PACKAGES)('$dir exposes the required scripts', ({ manifest }) => {
    expect(Object.keys(manifest.scripts ?? {})).toEqual(
      expect.arrayContaining(['build', 'typecheck', 'lint']),
    )
  })
})

describe('module boundaries declared in AGENT.md', () => {
  it('keeps scrum-domain free of runtime dependencies', () => {
    const domain = PACKAGES.find(({ manifest }) => manifest.name === '@dsh-scrum/scrum-domain')
    expect(domain?.manifest.dependencies ?? {}).toEqual({})
  })

  it('lets scrum-application depend on the domain only', () => {
    const application = PACKAGES.find(
      ({ manifest }) => manifest.name === '@dsh-scrum/scrum-application',
    )
    expect(Object.keys(application?.manifest.dependencies ?? {})).toEqual([
      '@dsh-scrum/scrum-domain',
    ])
  })
})
