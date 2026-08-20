import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

// `AGENT.md` requires unit, integration and contract tests. Each package keeps
// them in `tests/<layer>/`; workspace-wide checks live in the root `tests/`.
const LAYERS = ['unit', 'integration', 'contract'] as const

function layerInclude(layer: (typeof LAYERS)[number]): string[] {
  return [`packages/*/*/tests/${layer}/**/*.test.ts`, `tests/${layer}/**/*.test.ts`]
}

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
    projects: LAYERS.map((layer) => ({
      extends: true,
      test: { name: layer, include: layerInclude(layer) },
    })),
    coverage: {
      provider: 'v8',
      include: ['packages/*/*/src/**/*.ts'],
      reporter: ['text', 'lcov'],
    },
  },
})
