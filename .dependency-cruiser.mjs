// Mechanical enforcement of the dependency direction in AGENT.md and
// docs/development/architecture.md section 6. Package manifests are checked
// separately by tests/workspace/workspace-packages.test.ts; this configuration
// checks the actual import graph, including relative imports that bypass
// package names.
const FILESYSTEM = '^(node:)?(fs|fs/promises|child_process|worker_threads)$'

/**
 * The rules, anchored on a package root. A rule that matches nothing reports
 * success, so `tests/workspace/dependency-boundaries.test.ts` re-runs these
 * against a tree of deliberate violations under `tests/fixtures/boundaries`
 * and fails if any of them stops matching. That is why the root is a
 * parameter rather than a literal.
 *
 * @param {string} root Path prefix holding `<group>/<package>/src`.
 * @returns {import('dependency-cruiser').IForbiddenRuleType[]}
 */
export function createBoundaryRules(root = 'packages') {
  const DOMAIN = `^${root}/core/scrum-domain/src`
  const APPLICATION = `^${root}/core/scrum-application/src`
  const UI = `^${root}/ui/[^/]+/src`
  const HARNESS_CLIENT = `^${root}/harness/scrum-harness-client/src`

  return [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'A cycle between modules makes ownership and rollback ambiguous.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-unresolvable',
      severity: 'error',
      comment: 'An import that does not resolve is a broken build waiting to happen.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'domain-stays-pure',
      severity: 'error',
      comment:
        'scrum-domain must not depend on React, Harness, HTTP, storage adapters or Node built-ins. It may only import itself.',
      from: { path: DOMAIN },
      to: { pathNot: DOMAIN },
    },
    {
      name: 'application-defines-ports-only',
      severity: 'error',
      comment:
        'scrum-application must not depend on an edition, an adapter, the UI or a Harness plugin. Those depend on it.',
      from: { path: APPLICATION },
      to: { path: `^${root}/(editions|adapters|ui|harness|server)/` },
    },
    {
      name: 'ui-has-no-infrastructure',
      severity: 'error',
      comment:
        'scrum-ui receives data through props or a client interface; it must not touch the filesystem or a database.',
      from: { path: UI },
      to: { path: [FILESYSTEM, '^(pg|better-sqlite3|sqlite3|mysql2)$'] },
    },
    {
      name: 'harness-client-has-no-filesystem',
      severity: 'error',
      comment:
        'The Harness client runs in the browser and must reach workspace files through the host API.',
      from: { path: HARNESS_CLIENT },
      to: { path: FILESYSTEM },
    },
    {
      name: 'no-cross-package-file-import',
      severity: 'error',
      comment:
        'Reach another workspace package by its package name, never by a relative path into its files.',
      from: { path: `^${root}/[^/]+/([^/]+)/src` },
      // A package-name import resolves through the `paths` map in
      // `tsconfig.depcruise.json` and lands on the same `src` path a relative
      // import would, so the path alone cannot tell them apart. The alias tag
      // is what distinguishes them.
      to: {
        path: `^${root}/[^/]+/(?!$1/)[^/]+/src`,
        dependencyTypesNot: ['aliased-tsconfig-paths'],
      },
    },
    {
      name: 'no-undeclared-dependency-in-source',
      severity: 'error',
      comment:
        'Source code must declare what it imports in its own package.json, not lean on a hoisted development dependency. A peer dependency is a valid declaration: a Harness package is provided by the host process and must not be installed a second time.',
      from: { path: `^${root}/[^/]+/[^/]+/src` },
      to: {
        dependencyTypes: ['npm-dev', 'npm-no-pkg', 'npm-unknown', 'undetermined'],
        dependencyTypesNot: ['npm-peer'],
      },
    },
  ]
}

/** Resolution behaviour shared by `pnpm lint:deps` and the fixture run. */
export const cruiseOptions = {
  // Build output is not followed, so the bundled browser artefact does not
  // contribute the imports its bundler already resolved. It is deliberately
  // not excluded: excluding it drops every edge that lands there, which is
  // how these rules stopped enforcing anything once before. Not following it
  // leaves a drifted edge visible to the rules.
  doNotFollow: { path: '(^|/)node_modules/|^packages/[^/]+/[^/]+/dist/' },
  exclude: { path: '^coverage/' },
  tsPreCompilationDeps: true,
  // Not `tsconfig.base.json`: `tsconfig.depcruise.json` adds a `paths` map
  // from every workspace specifier to its sources. pnpm links a workspace
  // package as a symlink, so without it enhanced-resolve reports the real
  // path inside `dist` and none of the `src`-based rules below can match a
  // package-name import. Resolving through `paths` also tags those edges
  // `aliased-tsconfig-paths`, which keeps them distinguishable from the
  // relative imports `no-cross-package-file-import` rejects. Only this file
  // reads that tsconfig; the build resolves through `exports` as usual.
  tsConfig: { fileName: 'tsconfig.depcruise.json' },
  enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'types'] },
}

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: createBoundaryRules(),
  options: {
    ...cruiseOptions,
    // The fixture tree exists to violate these rules; only the test that
    // targets it may cruise it.
    exclude: { path: '^(coverage|tests/fixtures)/' },
  },
}
