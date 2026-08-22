/**
 * Visual system for the Scrum surface.
 *
 * Kept in the client package because this is the browser integration boundary:
 * the framework-agnostic UI package remains renderable in tests and other hosts,
 * while the installed bundle can inherit the Harness palette at runtime.
 */
export const SCRUM_STYLES = String.raw`
[data-scrum-overlay] {
  --scrum-accent: var(--dsw-alias-state-business-primary, var(--dsw-alias-accent-base, #6d5ce8));
  --scrum-accent-strong: var(--dsw-alias-accent-strong, #5746d7);
  --scrum-panel: var(--dsw-alias-bg-elevated, color-mix(in srgb, Canvas 96%, currentColor 4%));
  --scrum-panel-subtle: var(--dsw-alias-bg-subtle, color-mix(in srgb, Canvas 92%, currentColor 8%));
  --scrum-border: var(--dsw-alias-border-base, color-mix(in srgb, currentColor 15%, transparent));
  --scrum-muted: var(--dsw-alias-fg-muted, color-mix(in srgb, currentColor 62%, transparent));
  --scrum-danger: var(--dsw-alias-fg-danger, #c63f52);
  --scrum-warning: var(--dsw-alias-fg-warning, #a56a12);
  --scrum-shadow: 0 16px 50px color-mix(in srgb, #111827 16%, transparent);
  --scrum-radius: 14px;
  color: var(--dsw-alias-fg-base, CanvasText);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.45;
}

[data-scrum-overlay] *,
[data-scrum-overlay] *::before,
[data-scrum-overlay] *::after {
  box-sizing: border-box;
}

[data-scrum-overlay] h1,
[data-scrum-overlay] h2,
[data-scrum-overlay] h3,
[data-scrum-overlay] h4,
[data-scrum-overlay] p,
[data-scrum-overlay] ul,
[data-scrum-overlay] fieldset {
  margin: 0;
}

[data-scrum-overlay] ul {
  padding: 0;
  list-style: none;
}

[data-scrum-overlay] button,
[data-scrum-overlay] input,
[data-scrum-overlay] select,
[data-scrum-overlay] textarea {
  font: inherit;
}

[data-scrum-overlay] button {
  min-height: 36px;
  padding: 7px 13px;
  border: 1px solid var(--scrum-border);
  border-radius: 9px;
  background: var(--scrum-panel);
  color: inherit;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
}

[data-scrum-overlay] button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--scrum-accent) 52%, var(--scrum-border));
  background: color-mix(in srgb, var(--scrum-accent) 8%, var(--scrum-panel));
}

[data-scrum-overlay] button:active:not(:disabled) { transform: translateY(1px); }
[data-scrum-overlay] button:disabled { cursor: not-allowed; opacity: .5; }

[data-scrum-overlay] button:focus-visible,
[data-scrum-overlay] input:focus-visible,
[data-scrum-overlay] select:focus-visible,
[data-scrum-overlay] textarea:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--scrum-accent) 30%, transparent);
  outline-offset: 1px;
  border-color: var(--scrum-accent);
}

[data-scrum-overlay] input:not([type="checkbox"]):not([type="radio"]),
[data-scrum-overlay] select,
[data-scrum-overlay] textarea {
  width: 100%;
  min-height: 40px;
  padding: 8px 11px;
  border: 1px solid var(--scrum-border);
  border-radius: 9px;
  background: var(--scrum-panel);
  color: inherit;
}

[data-scrum-overlay] textarea { min-height: 96px; resize: vertical; }
[data-scrum-overlay] input[type="checkbox"],
[data-scrum-overlay] input[type="radio"] { accent-color: var(--scrum-accent); }

[data-scrum-workbench] {
  width: 100%;
  min-height: 100%;
  margin: 0 auto;
  padding: 0;
}

[data-scrum-workbench] > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 28px;
}

[data-scrum-topbar] {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0;
  min-height: 44px;
  margin: 0 !important;
  padding: 12px 28px 0 20px;
  border-bottom: 0;
}

[data-scrum-topbar] label {
  flex: 0 0 auto;
  color: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}

[data-scrum-topbar] select {
  width: auto;
  max-width: min(420px, 55vw);
  min-height: 32px;
  padding: 4px 28px 4px 8px;
  border: 0;
  border-radius: 12px;
  background-color: transparent;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  text-overflow: ellipsis;
}

[data-scrum-topbar] select:hover:not(:disabled) {
  background-color: var(--scrum-panel-subtle);
}

[data-scrum-workbench] > header h1 {
  font-size: 22px;
  line-height: 1.15;
  letter-spacing: -.035em;
}

[data-scrum-back]::before { content: "←"; margin-right: 7px; }

[data-scrum-page] {
  display: grid;
  gap: 8px;
  padding: clamp(24px, 4vw, 48px);
}

[data-scrum-page="bound"],
[data-scrum-page="archived"] { gap: 0; padding: 0; }

[data-scrum-page="bound"] > [data-scrum-moved],
[data-scrum-page="archived"] > [data-scrum-moved] {
  margin: 16px clamp(20px, 3vw, 40px) 0 !important;
}

[data-scrum-page] > h2 {
  font-size: 20px;
  line-height: 1.25;
  letter-spacing: -.02em;
}

[data-scrum-page] > h2 + p { max-width: 720px; color: var(--scrum-muted); }
[data-scrum-workspace] {
  color: var(--scrum-accent);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: .08em;
  text-transform: uppercase;
}

[data-scrum-project] {
  width: fit-content;
  margin-top: 4px !important;
  padding: 5px 10px;
  border: 1px solid var(--scrum-border);
  border-radius: 999px;
  background: var(--scrum-panel-subtle);
  color: var(--scrum-muted);
  font-size: 13px;
  font-weight: 650;
}

[data-scrum-surface] { margin-top: 0; }
[data-scrum-surface] > nav {
  display: flex;
  align-items: flex-end;
  gap: 36px;
  width: 100%;
  min-height: 35px;
  margin-bottom: 0;
  padding: 4px 28px 0;
  border: 0;
  border-bottom: 1px solid var(--dsw-alias-border-l2, var(--scrum-border));
  border-radius: 0;
  background: transparent;
}

[data-scrum-surface] > nav button {
  position: relative;
  min-width: 0;
  min-height: 0;
  padding: 0 0 11px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--scrum-muted);
  font-size: 13px;
  font-weight: 500;
  line-height: 16px;
}

[data-scrum-surface] > nav button:hover:not(:disabled) {
  border-color: transparent;
  background: transparent;
}
[data-scrum-surface] > nav button[aria-pressed="true"] {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  color: var(--scrum-accent);
  font-weight: 500;
}

[data-scrum-surface] > nav button[aria-pressed="true"]::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--scrum-accent);
  content: "";
}

[data-scrum-surface] > section {
  margin: 0;
  padding: clamp(24px, 3vw, 40px);
}
`
