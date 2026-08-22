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
  --scrum-content-padding: clamp(24px, 3vw, 40px);
  color: var(--dsw-alias-fg-base, CanvasText);
  font-family: inherit;
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

[data-scrum-runtime] {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin: 8px 28px 0;
  color: var(--scrum-muted);
  font-size: 12px;
}
[data-scrum-runtime] dt { font-weight: 700; }
[data-scrum-runtime] dd { margin: 0 14px 0 0; color: inherit; }

[data-scrum-back]::before { content: "←"; margin-right: 7px; }

[data-scrum-page] {
  display: grid;
  gap: 8px;
  padding: var(--scrum-content-padding);
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
  padding: var(--scrum-content-padding);
}

[data-scrum-home] {
  display: grid;
  align-content: start;
  gap: 10px;
  max-width: 920px;
}

[data-scrum-home] > [data-scrum-project] { margin: 0 !important; }
[data-scrum-home] > h2 { margin-top: 4px; font-size: 20px; letter-spacing: -.02em; }
[data-scrum-home] > h3 { margin-top: 24px; font-size: 15px; }
[data-scrum-home] > p:not([data-scrum-project]) { max-width: 680px; color: var(--scrum-muted); }

[data-scrum-backlog],
[data-scrum-sprints],
[data-scrum-access] { display: grid; gap: 18px; }

[data-scrum-backlog] > h2,
[data-scrum-sprints] > h2 { font-size: 16px; }

[data-scrum-toolbar] {
  display: grid;
  grid-template-columns: minmax(220px, 2fr) minmax(150px, 1fr) auto auto;
  align-items: end;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius);
  background: var(--scrum-panel-subtle);
}

[data-scrum-toolbar] p { display: grid; gap: 6px; }
[data-scrum-toolbar] p:has(input[type="checkbox"]) {
  display: flex;
  align-items: center;
  min-height: 40px;
  gap: 8px;
  padding: 0 4px;
  white-space: nowrap;
}

[data-scrum-overlay] label,
[data-scrum-overlay] legend { font-size: 13px; font-weight: 650; color: var(--scrum-muted); }

[data-scrum-create-open],
[data-scrum-sprint-create-open],
[data-scrum-submit],
[data-scrum-item-submit],
[data-scrum-sprint-submit],
[data-scrum-transition] {
  width: fit-content;
  border-color: transparent !important;
  background: var(--scrum-accent) !important;
  color: white !important;
  font-weight: 700;
}

[data-scrum-create-open]::before,
[data-scrum-sprint-create-open]::before { content: "+"; margin-right: 7px; font-size: 17px; }

[data-scrum-create],
[data-scrum-wizard],
[data-scrum-sprint-form],
[data-scrum-access] {
  padding: clamp(18px, 2.5vw, 28px);
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius);
  background: var(--scrum-panel);
}

[data-scrum-create] { display: grid; gap: 16px; }
[data-scrum-connect-entry] {
  display: grid;
  gap: 12px;
  align-items: start;
  padding: clamp(18px, 2.5vw, 28px);
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius);
  background: var(--scrum-panel);
}
[data-scrum-connect-entry] > button { width: fit-content; }
[data-scrum-connect-entry] [role="region"] { display: grid; gap: 6px; }
[data-scrum-connect-entry] p { max-width: 720px; color: var(--scrum-muted); }
[data-scrum-wizard],
[data-scrum-item-form],
[data-scrum-sprint-form] {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

[data-scrum-wizard] > h3,
[data-scrum-item-form] > h3,
[data-scrum-sprint-form] > h3 { grid-column: 1 / -1; }

[data-scrum-wizard] > p,
[data-scrum-item-form] > p,
[data-scrum-sprint-form] > p { display: grid; align-content: start; gap: 6px; }

[data-scrum-wizard] span,
[data-scrum-item-form] p > span,
[data-scrum-sprint-form] p > span { color: var(--scrum-muted); font-size: 12px; }

[data-scrum-list] { display: grid; gap: 16px; }
[data-scrum-group] {
  overflow: hidden;
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius);
  background: var(--scrum-panel);
}

[data-scrum-group] > h3 { padding: 15px 16px 2px; font-size: 15px; }
[data-scrum-group] > [data-scrum-totals] { padding: 0 16px 12px; }
[data-scrum-totals] { color: var(--scrum-muted); font-size: 12px; }

[data-scrum-row],
[data-scrum-card] {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 12px 16px;
  border-top: 1px solid var(--scrum-border);
}

[data-scrum-row] > button:first-child,
[data-scrum-card] > button:first-child {
  min-width: 0;
  flex: 1;
  padding: 2px 0;
  border: 0;
  background: transparent;
  text-align: left;
  font-weight: 650;
}

[data-scrum-row] > span,
[data-scrum-card] > span:not(:last-child),
[data-scrum-type],
[data-scrum-priority],
[data-scrum-estimate],
[data-scrum-criteria],
[data-scrum-dependencies],
[data-scrum-blocked] {
  flex: 0 0 auto;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--scrum-panel-subtle);
  color: var(--scrum-muted);
  font-size: 11px;
  font-weight: 650;
}

[data-scrum-priority="critical"], [data-scrum-blocked] {
  background: color-mix(in srgb, var(--scrum-danger) 12%, transparent);
  color: var(--scrum-danger);
}

[data-scrum-empty],
[data-scrum-loading] {
  padding: 44px 24px;
  border: 1px dashed var(--scrum-border);
  border-radius: var(--scrum-radius);
  text-align: center;
  color: var(--scrum-muted);
}

[data-scrum-empty] h3 { margin-bottom: 7px; color: inherit; }

[data-scrum-sprint-body] { display: grid; gap: 18px; }
[data-scrum-sprint-picker] { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 3px; }
[data-scrum-sprint-picker] button { white-space: nowrap; }
[data-scrum-sprint-picker] button[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--scrum-accent) 55%, var(--scrum-border));
  background: color-mix(in srgb, var(--scrum-accent) 10%, var(--scrum-panel));
  color: var(--scrum-accent);
}

[data-scrum-sprint-summary] {
  display: grid;
  gap: 8px;
  padding: 20px;
  border-radius: var(--scrum-radius);
  background: linear-gradient(135deg, color-mix(in srgb, var(--scrum-accent) 14%, var(--scrum-panel)), var(--scrum-panel));
  border: 1px solid color-mix(in srgb, var(--scrum-accent) 24%, var(--scrum-border));
}

[data-scrum-sprint-dates], [data-scrum-sprint-progress] { color: var(--scrum-muted); font-size: 13px; }
[data-scrum-columns] {
  display: grid;
  grid-template-columns: repeat(4, minmax(220px, 1fr));
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 6px;
}

[data-scrum-column] {
  min-width: 220px;
  padding: 12px;
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius);
  background: var(--scrum-panel-subtle);
}

[data-scrum-column] > h4 { display: inline; font-size: 13px; }
[data-scrum-column] > [data-scrum-totals] { display: inline; margin-left: 8px; }
[data-scrum-column] > ul { display: grid; gap: 9px; margin-top: 12px; }
[data-scrum-column] [data-scrum-card] {
  display: grid;
  grid-template-columns: 1fr auto;
  border: 1px solid var(--scrum-border);
  border-radius: 11px;
  background: var(--scrum-panel);
}

[data-scrum-column] [data-scrum-card] > button:first-child { grid-column: 1 / -1; }
[data-scrum-column] [data-scrum-card] > span:last-child { grid-column: 1 / -1; display: grid; gap: 5px; }

[data-scrum-planning] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
[data-scrum-pane] {
  padding: 16px;
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius);
  background: var(--scrum-panel);
}

[data-scrum-pane] > h4 { margin-bottom: 10px; }
[data-scrum-pane] [data-scrum-row] { padding-inline: 0; }

[data-scrum-detail] {
  position: fixed;
  z-index: 3;
  top: 16px;
  right: 16px;
  bottom: 16px;
  width: min(520px, calc(100vw - 32px));
  overflow: auto;
  padding: 24px;
  border: 1px solid var(--scrum-border);
  border-radius: 18px;
  background: var(--scrum-panel);
  box-shadow: var(--scrum-shadow);
}

[data-scrum-detail] > h3 { max-width: calc(100% - 90px); margin-bottom: 20px; }
[data-scrum-detail-close] { position: absolute; top: 18px; right: 18px; }
[data-scrum-detail] > section { margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--scrum-border); }
[data-scrum-detail] [data-scrum-item-form] { grid-template-columns: 1fr; }
[data-scrum-detail] section > h4 { margin-bottom: 12px; }
[data-scrum-detail] section li { display: flex; align-items: center; gap: 8px; padding: 7px 0; }

[data-scrum-access] { max-width: 820px; }
[data-scrum-access-modes] { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; border: 0; padding: 0; }
[data-scrum-access-modes] legend { margin-bottom: 10px; }
[data-scrum-access-modes] p {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 9px;
  padding: 14px;
  border: 1px solid var(--scrum-border);
  border-radius: 11px;
  background: var(--scrum-panel-subtle);
}

[data-scrum-access-modes] p span { grid-column: 2; color: var(--scrum-muted); font-size: 12px; }
[data-scrum-access-effective] { width: fit-content; padding: 8px 11px; border-radius: 9px; background: var(--scrum-panel-subtle); }

[data-scrum-failure],
[data-scrum-error],
[data-scrum-create-failure],
[data-scrum-moved] {
  padding: 13px 15px;
  border: 1px solid color-mix(in srgb, var(--scrum-danger) 35%, var(--scrum-border));
  border-radius: 11px;
  background: color-mix(in srgb, var(--scrum-danger) 8%, var(--scrum-panel));
}

[data-scrum-failure] { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
[data-scrum-failure] p:nth-child(2) { flex: 1; min-width: 240px; }

[data-scrum-leave], [data-scrum-confirm] {
  position: fixed;
  z-index: 5;
  top: 50%;
  left: 50%;
  width: min(460px, calc(100vw - 32px));
  padding: 24px;
  border: 1px solid var(--scrum-border);
  border-radius: 18px;
  background: var(--scrum-panel);
  box-shadow: var(--scrum-shadow);
  transform: translate(-50%, -50%);
}

[data-scrum-leave] h2, [data-scrum-confirm] h3 { margin-bottom: 8px; }
[data-scrum-leave] p, [data-scrum-confirm] > p { margin-bottom: 18px; color: var(--scrum-muted); }
[data-scrum-leave] button + button, [data-scrum-confirm] button + button { margin-left: 8px; }

@media (max-width: 900px) {
  [data-scrum-toolbar] { grid-template-columns: 1fr 1fr; }
  [data-scrum-columns] { grid-template-columns: repeat(4, minmax(250px, 78vw)); }
  [data-scrum-planning] { grid-template-columns: 1fr; }
}

@media (max-width: 620px) {
  [data-scrum-topbar] { padding-right: 20px; }
  [data-scrum-topbar] select { min-width: 0; max-width: calc(100vw - 190px); }
  [data-scrum-toolbar],
  [data-scrum-wizard],
  [data-scrum-item-form],
  [data-scrum-sprint-form],
  [data-scrum-access-modes] { grid-template-columns: 1fr; }
  [data-scrum-surface] > nav { gap: 36px; padding-inline: 28px; overflow-x: auto; }
  [data-scrum-surface] > nav button { flex: 0 0 auto; }
  [data-scrum-row] { align-items: flex-start; flex-wrap: wrap; }
  [data-scrum-row] > button:first-child { flex-basis: 100%; }
  [data-scrum-detail] { inset: 0; width: 100%; border-radius: 0; }
}

@media (prefers-reduced-motion: reduce) {
  [data-scrum-overlay] * { scroll-behavior: auto !important; transition: none !important; }
}
`
