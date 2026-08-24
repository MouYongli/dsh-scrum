# Example Prompts

## Create a plugin Web UI

```text
Use the deepseek-harness-web-ui skill to implement the Web UI
for this DeepSeek Harness plugin.

Preserve the existing backend API and plugin manifest.

Create:
- plugin overview;
- task list;
- task detail;
- run detail;
- structured Agent activity;
- tool invocation cards;
- approval requests;
- artifact list and preview;
- logs;
- error and recovery states;
- responsive navigation.
```

## Improve an existing plugin

```text
Use the deepseek-harness-web-ui skill to redesign the current plugin UI.

Do not change backend behavior.

Fix:
- unclear task and run hierarchy;
- chat-only execution presentation;
- hidden approval scope;
- unreadable tool output;
- missing artifact provenance;
- weak error recovery;
- narrow-screen layout problems.
```

## Data acceptance plugin

```text
Use the deepseek-harness-web-ui skill to create a Web UI
for a data acceptance Harness plugin.

Include:
- dataset input;
- validation rules;
- task execution;
- validation progress by step;
- failed-record inspection;
- requires_review state;
- approval for risky fixes;
- JSON report artifacts;
- logs and retry actions.
```

## Review the Scrum workbench in the shell

```text
Use the deepseek-harness-web-ui skill to review the Scrum workbench.

Mount the bundle, seed a project, and open Scrum from the sidebar footer
as described in section 16 of the skill.

Walk the six sections at 1440, 1200, 900 and 720 px, in both themes,
with the sidebar expanded and collapsed.

Review:
- first-run states;
- section hierarchy;
- work item drawer;
- status and priority tone;
- keyboard reach and focus return;
- Esc with an IME active;
- narrow-width behaviour.

Record findings with templates/ui-review.md. Say which states were real
and which were mocked.
```
