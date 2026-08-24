# Agent Workspace Patterns

## Recommended desktop layout

```text
┌───────────────────────────────────────────────────────┐
│ Plugin Header / Workspace / Active Run               │
├─────────────┬───────────────────────┬─────────────────┤
│ Navigation  │ Main Task Workspace   │ Context Panel   │
│ Tasks       │ Objective             │ Agent Activity  │
│ Runs        │ Plan / Result         │ Tools / Details │
│ Artifacts   │                       │                 │
└─────────────┴───────────────────────┴─────────────────┘
```

This is a Web layout pattern, not an Electron window shell.

## Main workspace

Use the center for:

- task definition;
- form inputs;
- plan;
- result;
- data preview;
- report;
- artifact preview.

## Context panel

Use for:

- current step;
- Agent activity;
- selected tool call;
- evidence;
- properties;
- approval details;
- selected artifact metadata.

The panel should be collapsible.

## Activity timeline

A useful activity entry includes:

- timestamp;
- event type;
- concise summary;
- status;
- affected resource;
- expandable detail.

## Chat

Chat may be one interaction mode, but it should not replace:

- plans;
- step states;
- approvals;
- files;
- artifacts;
- logs;
- errors;
- results.

## Long-running tasks

Show:

- active step;
- completed steps;
- waiting reason;
- elapsed time;
- pause/resume when supported;
- cancel;
- logs;
- recovery.

Use indeterminate indicators when progress is not measurable.

## Empty states

Examples:

- no task created;
- no run yet;
- no artifact generated;
- no approval pending;
- no logs for the selected filter.

Each empty state should provide a useful next action where appropriate.
