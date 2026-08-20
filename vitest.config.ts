import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

// `AGENT.md` requires unit, integration and contract tests. Each package keeps
// them in `tests/<layer>/`.
const PACKAGE_LAYERS = ['unit', 'integration', 'contract'] as const

// Guards over the workspace itself — package manifests, entry point shapes,
// dependency freedom. They assert nothing about product behaviour, so they get
// their own layer instead of diluting the contract layer.
const WORKSPACE_LAYER = 'workspace'

// Tests import workspace packages by name but must run against their sources:
// resolving through `dist` would make a test run depend on how fresh the last
// build was.
function sourceAliases(): Record<string, string> {
  const aliases: Record<string, string> = {}
  for (const group of readdirSync('packages')) {
    for (const pkg of readdirSync(join('packages', group))) {
      const dir = join('packages', group, pkg)
      const { name } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        name: string
      }
      aliases[name] = new URL(`${dir}/src/index.ts`, import.meta.url).pathname
    }
  }
  return aliases
}

export default defineConfig({
  resolve: { alias: sourceAliases() },
  test: {
    projects: [
      ...PACKAGE_LAYERS.map((layer) => ({
        extends: true as const,
        test: { name: layer, include: [`packages/*/*/tests/${layer}/**/*.test.ts`] },
      })),
      {
        extends: true as const,
        test: { name: WORKSPACE_LAYER, include: [`tests/${WORKSPACE_LAYER}/**/*.test.ts`] },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/*/src/**/*.ts'],
      reporter: ['text', 'lcov'],
    },
  },
})
