# Anti-Patterns

## Structure

Avoid:

- chat as the only view;
- logs as the only execution status;
- mixing task definition, activity, and settings on one page;
- hiding blocked approvals;
- hiding generated artifacts;
- unclear distinction between task and run.

## Visual design

Avoid:

- default purple gradients;
- excessive glassmorphism;
- every section as a rounded card;
- weak gray-on-gray contrast;
- decorative animations;
- fake dashboard metrics;
- excessive empty space in dense workspaces.

## Agent interactions

Avoid:

- generic confirmation dialogs for high-impact actions;
- raw tool JSON as the primary interface;
- unexplained retries;
- fake progress percentages;
- losing partial results after failure;
- disabling buttons without explanation;
- silently waiting for user input;
- silent permission failures.

## Better approach

Use:

- structured task states;
- step timelines;
- contextual tool summaries;
- explicit approval scope;
- artifact provenance;
- clear error recovery;
- semantic status tokens;
- task-focused hierarchy.
