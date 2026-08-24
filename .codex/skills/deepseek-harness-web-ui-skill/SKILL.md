---
name: deepseek-harness-web-ui
description: Design, implement, review, and improve Web interfaces for DeepSeek Harness plugins, including agent workspaces, task and run views, tool activity, approvals, artifacts, logs, settings, and responsive plugin pages.
---

# DeepSeek Harness Web UI

## Purpose

Use this Skill when creating, redesigning, implementing, or reviewing the Web UI of a DeepSeek Harness plugin.

The result should help users understand:

- what the plugin does;
- what task is currently active;
- what the Agent plans to do;
- which tools are running;
- what artifacts were created;
- whether user approval is required;
- what failed;
- how the task can resume or recover.

This is a Web UI Skill. Do not introduce Electron-specific patterns unless the project explicitly uses Electron.

## In this repository

The sections below describe Harness plugin UI in general. The Scrum plugin in
this repository has a settled surface, and where the two differ the repository
wins.

Read `references/scrum-surface.md` first. It records the Slots the UI mounts
into, the six workbench sections, the first-run states and the mode-switch
contract. Read `references/harness-theme-tokens.md` before touching any colour,
gap or radius.

Engineering rules that outrank anything here: `AGENT.md` at the repository
root, and [开发指南](../../../docs/development/dsh-dev-guide.md) for the
measured Slot contract.

## Scope

Use for:

- plugin landing page;
- workspace page;
- task detail page;
- run detail page;
- session history;
- tool invocation panel;
- approval panel;
- artifact browser;
- logs and provenance;
- plugin configuration;
- model and runtime settings;
- error and recovery flows;
- responsive Web layouts.

## Required workflow

### 1. Inspect the plugin first

Before changing UI code:

1. inspect the repository structure;
2. locate the plugin manifest and entry points;
3. identify the frontend framework;
4. identify backend routes, events, and data contracts;
5. identify task, run, session, tool, artifact, and approval models;
6. locate existing shared components and design tokens;
7. preserve existing plugin behavior and API contracts.

Do not redesign the backend contract merely to simplify the frontend.

### 2. Identify the plugin interaction model

Determine whether the plugin is primarily:

- task-driven;
- chat-driven;
- workflow-driven;
- artifact-driven;
- monitoring-driven;
- configuration-driven.

Prefer task-oriented and structured views when users need to inspect execution, files, plans, evidence, and results.

Do not make chat the only interface unless conversation is genuinely the primary product.

### 3. Create a compact UI brief

Before implementation, determine:

- plugin purpose;
- target users;
- primary task;
- entry page;
- main entities;
- primary actions;
- status model;
- approval requirements;
- artifact types;
- error and recovery behavior;
- responsive requirements;
- existing components that must remain.

Use `templates/plugin-ui-brief.md` for complex tasks.

### 4. Recommended information architecture

A Harness plugin commonly needs:

```text
Plugin Header
├── Workspace / Project Context
├── Navigation
│   ├── Overview
│   ├── Tasks
│   ├── Runs
│   ├── Artifacts
│   └── Settings
└── Main Content
    ├── Task Objective
    ├── Plan and Steps
    ├── Agent Activity
    ├── Tool Calls
    ├── Approvals
    ├── Artifacts
    ├── Logs
    └── Result
```

Not every plugin needs every section. Prioritize the main user task.

In this repository the architecture is already decided: a workbench overlay
with six sections, listed in `references/scrum-surface.md`. Do not propose the
Overview / Tasks / Runs / Artifacts navigation here.

### 5. Core page patterns

#### Plugin overview

Show:

- plugin purpose;
- current workspace;
- recent tasks;
- active runs;
- blocked approvals;
- recent artifacts;
- health or connection state;
- primary action.

#### Task page

Show:

- objective;
- inputs;
- plan;
- current step;
- execution state;
- outputs;
- approvals;
- errors;
- recovery actions.

#### Run page

Show:

- run identifier;
- start time;
- duration;
- current status;
- step timeline;
- tool events;
- logs;
- artifacts;
- warnings;
- final outcome.

#### Artifact page

Show:

- artifact type;
- name;
- preview;
- source task and run;
- creation time;
- provenance;
- validation result;
- download or open action when supported.

#### Settings page

Separate:

- plugin settings;
- model settings;
- tool permissions;
- workspace permissions;
- runtime settings;
- advanced or dangerous options.

### 6. Represent Agent execution structurally

Do not represent all execution as plain chat messages.

Use structured event types such as:

- task created;
- plan generated;
- step started;
- tool requested;
- tool running;
- tool completed;
- artifact generated;
- validation warning;
- approval requested;
- user response received;
- retry scheduled;
- step failed;
- recovery started;
- task completed.

Each event should communicate:

- actor;
- action;
- status;
- time;
- affected resource;
- optional evidence;
- available next action.

### 7. Implement meaningful status states

Use the state definitions in `references/run-and-task-states.md`.

At minimum, consider:

- draft;
- queued;
- planning;
- running;
- waiting for tool;
- waiting for user;
- waiting for approval;
- paused;
- retrying;
- completed;
- completed with warnings;
- failed;
- cancelled.

Do not invent precise progress percentages when progress cannot be measured.

Prefer step progress and current activity.

### 8. Approval UI

Follow `references/approval-and-tool-ui.md`.

Approval requests should show:

- proposed action;
- reason;
- tool;
- target resource;
- expected side effects;
- permission scope;
- risk;
- evidence;
- approve;
- reject;
- edit;
- request clarification.

Avoid generic “Are you sure?” dialogs for meaningful Agent actions.

### 9. Tool activity UI

Tool calls should show:

- tool name;
- operation;
- input summary;
- execution status;
- duration;
- result summary;
- affected files or systems;
- expandable technical details;
- retry action when appropriate.

Hide secrets and sensitive credentials.

Raw JSON can be available in a secondary details panel, but should not be the primary presentation.

### 10. Error and recovery UI

Every recoverable failure should explain:

- what failed;
- which step was affected;
- whether prior outputs remain valid;
- whether retry is safe;
- what the Agent will do next;
- what the user can do;
- where technical details can be inspected.

Provide context-aware actions such as:

- retry step;
- resume task;
- edit input;
- change tool;
- grant permission;
- skip step;
- open logs;
- cancel task.

### 11. Design system

Use semantic tokens for:

- application background;
- navigation surface;
- content surface;
- elevated surface;
- text;
- muted text;
- borders;
- primary action;
- selected state;
- focus;
- success;
- warning;
- danger;
- information;
- running;
- waiting;
- paused.

In this repository the tokens exist and are bound to the host theme. Follow
`references/harness-theme-tokens.md` and extend
`packages/harness/scrum-harness-client/src/client/styles.ts`; do not start a
second palette.

### 12. Reusable components

Prefer reusable components such as:

- PluginShell
- PluginHeader
- WorkspaceSwitcher
- PluginNavigation
- TaskHeader
- RunStatus
- StepTimeline
- AgentActivity
- ToolCallCard
- ApprovalRequest
- ArtifactList
- ArtifactPreview
- LogViewer
- ErrorPanel
- EmptyState
- PermissionNotice
- ConnectionStatus
- FilterBar
- DetailDrawer

Do not create a separate card component for every small piece of text.

That list is the generic vocabulary. In this repository the components already
exist under `packages/ui/scrum-ui/src/` — the workbench and its sections, the
filter bar, the work item form and detail drawer, the board and list views, the
skeleton. Look there before naming anything new, and keep view models separate
from components the way `pages.ts` does, so a state nobody exercised cannot
render nothing at all.

### 13. Responsive Web behavior

Follow `references/responsive-design.md`.

At narrower widths:

1. preserve task objective and active state;
2. collapse secondary navigation;
3. move detail panels into drawers or tabs;
4. preserve approval actions;
5. keep logs and raw details secondary;
6. avoid compressing three columns into unreadable widths.

### 14. Accessibility

Follow `references/accessibility.md`.

At minimum:

- semantic HTML;
- keyboard navigation;
- visible focus states;
- labeled controls;
- accessible dialogs and drawers;
- sufficient contrast;
- status not conveyed by color alone;
- accessible icon-only buttons;
- reduced-motion support;
- live updates announced only when useful.

### 15. Avoid generic AI UI

Follow `references/anti-patterns.md`.

Avoid:

- chat-only interfaces for structured tasks;
- endless card grids;
- purple gradient defaults;
- excessive glassmorphism;
- fake metrics;
- decorative progress;
- raw logs as the primary status view;
- hidden approval scope;
- unexplained disabled actions;
- unclear task recovery.

### 16. Review and validation

The plugin has no standalone dev server. It renders inside a real Harness
shell, behind the sidebar entry, so a script that opens a URL and screenshots it
cannot reach the page. Drive the review through the shell instead; the loop is
[本地开发循环](../../../docs/development/local-development.md).

```bash
pnpm build                                         # node half: Host, Domain, Application
pnpm dev:link                                      # mount the bundle into the profile
pnpm dev:config                                    # expect one plugin line, the bundle
node scripts/seed-demo-project.js ~/some-project   # so the pages have something to show
pnpm watch                                         # browser half, rebuilds on change
cd ~/some-project && npx @deepseek-ai/dsh web
```

Then, in the shell:

1. open Scrum from the sidebar footer;
2. walk the six sections;
3. check the first-run states — no workspace, unbound, stale, archived;
4. check the collapsed sidebar and the narrow widths in
   `references/responsive-design.md`;
5. check keyboard reach, focus return from the drawer and the dialogs, and Esc
   with an IME active;
6. check both themes, since every token is bound to the host palette;
7. fix the high-priority findings, then look again.

Screenshots come from driving that shell. This repository uses the Playwright
MCP browser for it; its scratch output is already ignored in `.gitignore`.
Record findings with `templates/ui-review.md`.

The browser half is not yet connected to the Host: the workbench reports that
the shell has no Scrum connection. See
[已知限制](../../../docs/product/known-limitations.md). Until that lands, review
against seeded and mocked state, and say so plainly rather than claiming an
integrated run.

### 17. Output expectations

When modifying code:

- produce working code;
- preserve plugin and backend contracts;
- list changed files;
- explain important structural changes;
- identify mocked states;
- state honestly which tests were run;
- do not claim successful integration when only static UI was implemented.

## Decision rules

### Create a new plugin UI

Produce:

1. UI brief;
2. information architecture;
3. component structure;
4. working implementation;
5. major execution states;
6. responsive behavior.

### Improve an existing plugin UI

Inspect first, then fix:

- weak task hierarchy;
- unclear execution state;
- chat-only presentation;
- hidden tool actions;
- poor approval context;
- missing artifact structure;
- inaccessible controls;
- weak responsive behavior.

### Review only

Group findings by:

- critical;
- high;
- medium;
- low.

For each finding include:

- location;
- problem;
- user impact;
- recommendation.
