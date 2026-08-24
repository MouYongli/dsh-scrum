# Approval and Tool UI

## Approval request structure

An approval request should answer:

- What will happen?
- Why is it needed?
- Which tool will perform it?
- What resources will be affected?
- Is the action reversible?
- What permissions are required?
- What evidence supports the action?
- What happens after approval?

## Approval actions

Depending on the operation:

- approve;
- reject;
- edit parameters;
- request clarification;
- approve once;
- approve for this task;
- inspect details.

Avoid broad persistent permission grants unless the product clearly explains the scope.

## Risk levels

Use clear language:

- low;
- moderate;
- high.

Do not rely on color alone.

## Tool card

A tool card may show:

- tool name;
- operation;
- status;
- input summary;
- output summary;
- duration;
- files changed;
- external systems affected;
- retry;
- technical detail.

## Sensitive data

Do not display:

- API keys;
- access tokens;
- passwords;
- full secrets;
- private headers.

Mask or omit sensitive fields.

## Raw data

Raw request and response data may be useful to technical users, but place it behind an expandable detail view.

Provide a human-readable summary first.

## File changes

When a tool changes files, show:

- created files;
- modified files;
- deleted files;
- workspace-relative paths;
- optional diff;
- whether changes are committed or temporary.
