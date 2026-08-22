import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
function sourceAliases(): { find: RegExp; replacement: string }[] {
  const aliases: { find: RegExp; replacement: string }[] = []
  for (const group of readdirSync('packages')) {
    for (const pkg of readdirSync(join('packages', group))) {
      const dir = join('packages', group, pkg)
      const { name, exports } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        name: string
        exports?: Record<string, unknown>
      }
      // Every subpath a package publishes as code, not only its root: the
      // browser half of a plugin is reached as `<name>/client`, and a test
      // that could not import it could only cover the half nobody ships.
      for (const subpath of Object.keys(exports ?? {})) {
        const source =
          subpath === '.' ? `${dir}/src/index.ts` : `${dir}/src/${subpath.slice(2)}/index.ts`
        if (!existsSync(source)) continue
        const specifier = subpath === '.' ? name : `${name}/${subpath.slice(2)}`
        // Anchored, because a bare string alias matches by prefix: the root
        // specifier would swallow `<name>/client` and resolve it to a path
        // inside the root entry point.
        aliases.push({
          find: new RegExp(`^${specifier.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}$`),
          replacement: new URL(source, import.meta.url).pathname,
        })
      }
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
      // A floor, not a target. The baseline sits at ~96/94: the interface
      // components are driven in a jsdom document by the tests under
      // `tests/integration`, so their handlers are executed rather than only
      // rendered, and what remains uncovered is the browser plugin entry,
      // which only runs inside a real shell. A drop below these numbers means
      // a real regression, not noise.
      thresholds: { statements: 90, branches: 85, functions: 85, lines: 90 },
    },
  },
})
