import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The profile composer and the client module loader read these facts and
// nothing else. Each one was a real failure before it was an assertion: a
// missing `./package.json` export made the loader skip the plugin silently,
// and a patch row naming a package the profile cannot resolve stopped the
// whole shell from booting.
const packageRoot = join(import.meta.dirname, '..', '..')

interface Manifest {
  name: string
  exports: Record<string, unknown>
  files: string[]
  dsh: { bundle?: { patch?: string }; client?: { platform?: string } }
  dependencies: Record<string, string>
}

const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as Manifest
const patch = readFileSync(join(packageRoot, 'cordis.patch.yml'), 'utf8')

describe('bundle manifest', () => {
  it('points the profile composer at the patch', () => {
    expect(manifest.dsh.bundle).toEqual({ patch: './cordis.patch.yml' })
    expect(manifest.files).toContain('cordis.patch.yml')
    expect(manifest.exports).toMatchObject({ './cordis.patch.yml': './cordis.patch.yml' })
  })

  it('declares the browser half the module loader serves', () => {
    expect(manifest.dsh.client).toEqual({ platform: 'web' })
    expect(manifest.exports['./client']).toBe('./dist/client.js')
  })

  it('exports its own manifest, which the loader reads to find the browser half', () => {
    expect(manifest.exports['./package.json']).toBe('./package.json')
  })
})

describe('profile layer patch', () => {
  it('inserts one row addressing this package', () => {
    expect(patch).toContain('- insert:')
    expect(patch).toContain('id: scrum')
    expect(patch).toContain(`name: '${manifest.name}'`)
  })

  it('names no package the profile cannot resolve', () => {
    // A row's package name resolves from the profile directory, where only the
    // installed bundle exists; the host and client packages are reachable from
    // inside it, so they are re-exported rather than named here.
    for (const internal of ['@dsh-scrum/scrum-harness-host', '@dsh-scrum/scrum-harness-client']) {
      expect(patch).not.toContain(internal)
      expect(Object.keys(manifest.dependencies)).toContain(internal)
    }
  })
})

describe('what the bundle composes', () => {
  it('depends on the Community edition, which is where the adapters are chosen', () => {
    expect(Object.keys(manifest.dependencies)).toContain('@dsh-scrum/edition-community')
  })
})
