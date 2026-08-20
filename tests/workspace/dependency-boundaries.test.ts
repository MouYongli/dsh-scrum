import { cruise } from 'dependency-cruiser'
import { describe, expect, it } from 'vitest'
import { createBoundaryRules, cruiseOptions } from '../../.dependency-cruiser.mjs'

// A dependency-cruiser rule only reports on edges it can see, so a rule whose
// edges have been filtered out of the graph reports success while enforcing
// nothing. That has happened twice: an `exclude` of `(^|/)(dist|coverage)/`
// once matched `node_modules/.pnpm/*/dist/*` and left the npm rules with
// nothing to judge, and an `exclude` of the workspace `dist` later hid every
// package-name import. Both runs were green.
//
// So every rule is re-run here against a tree that violates it on purpose. If
// a rule stops matching — because the graph changed, the resolver changed or
// the rule itself was narrowed — this fails instead of passing quietly.

const FIXTURE_ROOT = 'tests/fixtures/boundaries'

const RULES = createBoundaryRules(FIXTURE_ROOT)

// `validate` is what makes `cruise` apply `ruleSet`; without it the graph is
// built and every rule silently reports nothing — the same shape of failure
// this file exists to catch.
const result = await cruise([FIXTURE_ROOT], {
  ...cruiseOptions,
  validate: true,
  ruleSet: { forbidden: RULES },
})

const triggered = new Set(
  typeof result.output === 'string'
    ? []
    : result.output.summary.violations.map((violation) => violation.rule.name),
)

describe('every boundary rule still matches something', () => {
  it.each(RULES.map((rule) => rule.name))('%s is reported for its fixture', (name) => {
    expect([...triggered]).toContain(name)
  })

  it('has a fixture for every rule and a rule for every fixture violation', () => {
    expect([...triggered].sort()).toEqual(RULES.map((rule) => rule.name).sort())
  })
})

describe('the real graph is not empty', () => {
  it('cruises dependencies, which an over-wide exclude would reduce to zero', async () => {
    const real = await cruise(['packages', 'tests'], {
      ...cruiseOptions,
      exclude: { path: '^(coverage|tests/fixtures)/' },
    })
    if (typeof real.output === 'string') throw new Error('expected a cruise result object')
    expect(real.output.summary.totalDependenciesCruised).toBeGreaterThan(0)
  })
})
