# Boundary rule fixtures

Every module here violates a rule in `.dependency-cruiser.mjs` on purpose.
`tests/workspace/dependency-boundaries.test.ts` cruises this tree and fails if
a rule stops reporting its violation, which is how a rule that has quietly
stopped matching anything gets caught.

The tree mirrors `packages/<group>/<package>/src` because the rules are
anchored on that shape. It is excluded from `pnpm lint:deps`, `pnpm typecheck`
and `pnpm lint`; nothing here is meant to compile.
