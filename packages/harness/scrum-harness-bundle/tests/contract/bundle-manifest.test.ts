import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The profile composer reads these two facts and nothing else: the manifest
// field that names the patch, and the patch itself. Both are part of what
// "installable" means, so they are asserted rather than assumed.
const packageRoot = join(import.meta.dirname, '..', '..')

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(packageRoot, path), 'utf8')) as Record<string, unknown>
}

describe('bundle manifest', () => {
  const manifest = readJson('package.json')

  it('points the profile composer at the patch', () => {
    expect(manifest['dsh']).toEqual({ bundle: { patch: './cordis.patch.yml' } })
  })

  it('ships the patch, which would otherwise be missing from the published package', () => {
    expect(manifest['files']).toContain('cordis.patch.yml')
    expect(manifest['exports']).toMatchObject({ './cordis.patch.yml': './cordis.patch.yml' })
  })

  it('depends on the plugins its patch inserts', () => {
    const patch = readFileSync(join(packageRoot, 'cordis.patch.yml'), 'utf8')
    const dependencies = Object.keys(manifest['dependencies'] as Record<string, string>)

    for (const plugin of ['@dsh-scrum/scrum-harness-host', '@dsh-scrum/scrum-harness-client']) {
      expect(patch).toContain(plugin)
      expect(dependencies).toContain(plugin)
    }
  })

  it('inserts its rows with stable ids a later patch layer can address', () => {
    const patch = readFileSync(join(packageRoot, 'cordis.patch.yml'), 'utf8')

    expect(patch).toContain('- insert:')
    expect(patch).toContain('id: scrum-host')
    expect(patch).toContain('id: scrum-client')
  })
})
