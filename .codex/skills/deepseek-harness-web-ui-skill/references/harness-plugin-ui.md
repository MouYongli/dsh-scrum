# Harness Plugin UI

This file is the generic case. The Scrum plugin in this repository has its own
settled surface — Slots, sections, states — in `scrum-surface.md`, and that one
wins wherever the two differ.

## Primary design goal

A Harness plugin UI should make Agent execution observable, understandable, controllable, and recoverable.

## Core entities

Typical entities include:

- plugin;
- workspace;
- task;
- run;
- session;
- step;
- tool call;
- approval;
- artifact;
- log event;
- configuration.

Use the actual repository models as the source of truth.

## Recommended hierarchy

The user should quickly understand:

1. where they are;
2. what task is active;
3. what the Agent is doing;
4. whether anything is blocked;
5. what was produced;
6. what action is available.

## Plugin shell

A useful shell may contain:

- plugin name;
- workspace context;
- navigation;
- connection status;
- active run indicator;
- user or permission controls.

## Navigation

Stable destinations may include:

- Overview
- Tasks
- Runs
- Artifacts
- Settings

Contextual destinations may include:

- Plan
- Activity
- Tools
- Approvals
- Logs
- Result

Do not mix stable global navigation with temporary execution actions.

## Overview page

Prioritize:

- start or create task;
- active work;
- blocked work;
- recent results;
- connection or runtime warnings.

Avoid filling the page with generic statistics.

## Task detail

Recommended order:

1. task title and state;
2. objective and input;
3. current activity;
4. plan or step timeline;
5. approvals and blockers;
6. artifacts;
7. result;
8. logs and technical details.

## Run detail

Runs are execution records. They should be inspectable after completion.

Show:

- immutable run identity;
- timing;
- model/runtime context;
- steps;
- tools;
- warnings;
- artifacts;
- final outcome;
- failure reason.

## Provenance

Artifacts and results should link back to:

- source task;
- source run;
- generating step;
- tool;
- input;
- timestamp;
- validation result.
