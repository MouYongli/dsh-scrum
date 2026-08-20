// Mechanical enforcement of the dependency direction in AGENT.md and
// docs/development/architecture.md section 6. Package manifests are checked
// separately by tests/contract/workspace-packages.test.ts; this configuration
// checks the actual import graph, including relative imports that bypass
// package names.
const DOMAIN = '^packages/core/scrum-domain/src'
const APPLICATION = '^packages/core/scrum-application/src'
const UI = '^packages/ui/[^/]+/src'
const HARNESS_CLIENT = '^packages/harness/scrum-harness-client/src'
const FILESYSTEM = '^(node:)?(fs|fs/promises|child_process|worker_threads)$'

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
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
      to: { path: '^packages/(editions|adapters|ui|harness|server)/' },
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
      from: { path: '^packages/[^/]+/([^/]+)/src' },
      to: { path: '^packages/[^/]+/(?!$1/)[^/]+/src' },
    },
    {
      name: 'no-undeclared-dependency-in-source',
      severity: 'error',
      comment:
        'Source code must declare what it imports in its own package.json, not lean on a hoisted development dependency. A peer dependency is a valid declaration: a Harness package is provided by the host process and must not be installed a second time.',
      from: { path: '^packages/[^/]+/[^/]+/src' },
      to: {
        dependencyTypes: ['npm-dev', 'npm-no-pkg', 'npm-unknown', 'undetermined'],
        dependencyTypesNot: ['npm-peer'],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(packages/[^/]+/[^/]+/dist|coverage)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'types'] },
  },
}
