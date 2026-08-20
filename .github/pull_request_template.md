<!--
Title format: <type>(<scope>): <subject>
Example:      feat(scrum-domain): add work item state machine
Guideline:    docs/development/git-workflow.md
-->

Closes #

## Goal and non-goals

**Goal:**

**Non-goals:**

## Changes

<!-- What actually changed, grouped by package or module. -->

## Test evidence

<!-- Commands actually run and their results. Paste the relevant output. "Tested locally" is not evidence. -->

```text

```

## Compatibility impact

<!-- Harness versions, public Contract, Agent Tool surface, Edition composition. Write None if there is no impact. -->

## Data migration impact

<!-- `.scrum/` file layout, schemaVersion, revision handling and the migration path. Write None if there is no impact. -->

## Rollback plan

<!-- How to revert this pull request, and whether reverting needs extra data handling. -->

## Contract / Schema versioning

<!-- Required when this adds or changes a public Contract, Schema or persisted format. Otherwise N/A. -->

## Checklist

- [ ] Title follows `<type>(<scope>): <subject>` and the branch is `<type>/<issue>-<slug>`
- [ ] Every commit is one verifiable intent and stays within the 500-line handwritten limit from `AGENT.md`
- [ ] All Tasks in the linked issue are checked off
- [ ] Lint, typecheck and tests pass for the affected scope
- [ ] Module dependency direction in `AGENT.md` is respected
- [ ] Will be merged with a merge commit — squash and rebase merge are not allowed
