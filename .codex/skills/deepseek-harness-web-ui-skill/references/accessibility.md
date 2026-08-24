# Accessibility

## Semantics

- Use buttons for actions.
- Use links for navigation.
- Use logical heading levels.
- Use landmarks such as `nav`, `main`, and `aside`.
- Prefer native controls.

## Keyboard

- All actions must be keyboard reachable.
- Focus order must be logical.
- Dialogs and drawers must manage focus.
- Closing overlays should restore focus.
- Do not make approval dependent on mouse-only interaction.

## Status

Agent status must not be conveyed by color alone.

Use text labels such as:

- Running
- Waiting for approval
- Failed
- Completed with warnings

## Live updates

Use live regions sparingly.

Announce important changes such as:

- approval requested;
- task completed;
- task failed.

Do not announce every log line.

## Forms

- Label controls.
- Explain validation errors.
- Preserve input after recoverable errors.
- Connect errors with the affected field.

## Icon buttons

Provide accessible names:

```html
<button aria-label="Open run logs">
  ...
</button>
```

## Reduced motion

Respect `prefers-reduced-motion`.
