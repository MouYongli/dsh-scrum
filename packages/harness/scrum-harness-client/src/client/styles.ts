/**
 * Visual system for the Scrum surface.
 *
 * Kept in the client package because this is the browser integration boundary:
 * the framework-agnostic UI package remains renderable in tests and other hosts,
 * while the installed bundle can inherit the Harness palette at runtime.
 */
export const SCRUM_STYLES = String.raw`
/*
 * The palette, bound to the tokens ui-theme publishes.
 *
 * Every name below was checked against the theme package rather than guessed:
 * a var() whose token does not exist is not an error anybody sees, it silently
 * takes the fallback, so the surface drifts away from the shell while the
 * stylesheet still reads as though it were themed.
 *
 * Fallbacks are system colours rather than literals wherever a literal would
 * pair a fixed surface with an inherited foreground -- the shell sets the
 * document's color-scheme, so Canvas and CanvasText flip with the theme and a
 * pair derived from them always agrees. The exceptions are the three hues,
 * which no system colour expresses; those carry the theme's own value, so a
 * shell composed without ui-theme still lands on the Harness colour rather
 * than an unrelated one.
 */
[data-scrum-overlay] {
  --scrum-accent: var(--dsw-alias-state-business-primary, #4176e6);
  --scrum-accent-soft: var(--dsw-alias-state-business-tertiary, color-mix(in srgb, var(--scrum-accent) 22%, Canvas));
  --scrum-panel: var(--dsw-alias-bg-layer-1, Canvas);
  --scrum-panel-subtle: var(--dsw-alias-bg-module-platform, color-mix(in srgb, CanvasText 5%, Canvas));
  --scrum-border: var(--dsw-alias-border-l2, color-mix(in srgb, CanvasText 15%, transparent));
  --scrum-muted: var(--dsw-alias-label-secondary, color-mix(in srgb, CanvasText 62%, Canvas));
  --scrum-hover: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, CanvasText 6%, transparent));
  --scrum-danger: var(--dsw-alias-state-error-primary, #ec1313);
  --scrum-warning: var(--dsw-alias-state-warn-primary, #f59e0b);
  --scrum-success: var(--dsw-alias-state-success-primary, #22c55e);
  --scrum-shadow: 0 16px 50px color-mix(in srgb, #111827 16%, transparent);
  --scrum-radius: 14px;
  --scrum-content-padding: clamp(24px, 3vw, 40px);
  color: var(--dsw-alias-label-primary, CanvasText);
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
  position: relative;
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

[data-scrum-workbench] > [data-scrum-topbar] {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0;
  min-height: 44px;
  margin: 0 !important;
  padding: 12px 28px 0;
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
  max-width: min(240px, 25vw);
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
  background-color: var(--scrum-hover);
}

[data-scrum-workbench] > header h1 {
  font-size: 22px;
  line-height: 1.15;
  letter-spacing: -.035em;
}

[data-scrum-runtime] {
  position: absolute;
  top: 12px;
  right: 28px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  min-height: 32px;
  margin: 0;
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

[data-scrum-surface] { margin-top: 0; padding-top: 4px; }
[data-scrum-surface] > nav {
  display: flex;
  align-items: flex-start;
  gap: 36px;
  width: 100%;
  height: 28px;
  min-height: 28px;
  margin-bottom: 0;
  padding: 0 28px;
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

[data-scrum-project-heading] {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
[data-scrum-project-heading] > h2 {
  font-size: 20px;
  line-height: 1.25;
  letter-spacing: -.02em;
}
[data-scrum-project-heading] > [data-scrum-project] { margin: 0 !important; }
[data-scrum-project-edit] { margin-left: auto; }
[data-scrum-home] > h3 { margin-top: 24px; font-size: 15px; }
[data-scrum-home] > p { max-width: 680px; color: var(--scrum-muted); white-space: pre-wrap; }

[data-scrum-dashboard] {
  display: grid;
  gap: 18px;
  margin-top: 18px;
}

[data-scrum-dashboard] > section {
  padding: 18px;
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius);
  background: var(--scrum-panel);
}

[data-scrum-dashboard] h3 { font-size: 15px; margin-bottom: 10px; }
[data-scrum-dashboard] h4 { font-size: 14px; }

[data-scrum-sprint-totals],
[data-scrum-burndown] dl {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 22px;
  margin-top: 8px;
}
[data-scrum-sprint-totals] dt,
[data-scrum-burndown] dt { color: var(--scrum-muted); }
[data-scrum-sprint-totals] dd,
[data-scrum-burndown] dd { margin: 0 0 0 6px; font-variant-numeric: tabular-nums; }

/* The bar is the burndown: a filled length for what is left, and a marker
   where an even spread would have it by now. */
[data-scrum-burndown-bar] {
  position: relative;
  height: 10px;
  margin: 14px 0 10px;
  border-radius: 999px;
  background: var(--scrum-panel-subtle);
  overflow: hidden;
}
[data-scrum-burndown-remaining] {
  display: block;
  height: 100%;
  background: var(--scrum-accent);
}
[data-scrum-burndown-ideal] {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--scrum-warning);
}
[data-scrum-burndown-note] { color: var(--scrum-muted); font-size: 12px; }
[data-scrum-scope-change] { color: var(--scrum-warning); }

[data-scrum-signal] {
  padding: 12px 0;
  border-top: 1px solid var(--scrum-border);
}
[data-scrum-signal]:first-child { border-top: 0; padding-top: 0; }
[data-scrum-signal] > p { color: var(--scrum-muted); font-size: 12px; margin-bottom: 6px; }
[data-scrum-signal] li,
[data-scrum-activity] li {
  display: flex;
  gap: 12px;
  align-items: baseline;
  padding: 5px 0;
}
[data-scrum-signal] [data-scrum-meta],
[data-scrum-activity-at],
[data-scrum-activity-action] {
  color: var(--scrum-muted);
  font-size: 12px;
}
[data-scrum-activity-at] { font-variant-numeric: tabular-nums; }
[data-scrum-activity-problems] { color: var(--scrum-warning); }

[data-scrum-project-form] {
  display: grid;
  gap: 14px;
  max-width: 760px;
  padding: 18px;
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius);
  background: var(--scrum-panel);
}
[data-scrum-project-form] > p { display: grid; gap: 6px; }
[data-scrum-project-actions] { display: flex; justify-content: flex-end; gap: 8px; }
[data-scrum-project-save] {
  border-color: transparent !important;
  background: var(--scrum-accent) !important;
  color: white !important;
  font-weight: 700;
}

[data-scrum-backlog],
[data-scrum-sprints],
[data-scrum-access] { display: grid; gap: 18px; }

[data-scrum-backlog] > h2,
[data-scrum-sprints] > h2 { font-size: 16px; }

[data-scrum-toolbar] {
  display: flex;
  flex-wrap: wrap;
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

/* The bar wraps rather than scrolls: nine controls on one line would push the
   work off the screen the filter exists to narrow. */
[data-scrum-filter-bar] {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 10px 14px;
  flex: 1 1 100%;
}

[data-scrum-filter-field] { display: grid; gap: 6px; }
[data-scrum-filter-field]:has(input[type="checkbox"]) {
  display: flex;
  align-items: center;
  min-height: 40px;
  gap: 8px;
  white-space: nowrap;
}
[data-scrum-filter-bar] input[type="search"] { min-width: 200px; }
[data-scrum-filter-bar] select[multiple] { min-width: 130px; padding: 4px; }
[data-scrum-filter-bar] select:not([multiple]) { min-width: 150px; }
[data-scrum-filter-none] { color: var(--scrum-muted); font-size: 12px; align-self: center; }
[data-scrum-filter-clear] { align-self: center; }

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

[data-scrum-wizard] > [data-scrum-area] { grid-column: 1 / -1; }
[data-scrum-wizard] > [data-scrum-submit] { grid-column: 2; justify-self: end; }

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
  [data-scrum-workbench] > [data-scrum-topbar] { padding-right: 20px; }
  [data-scrum-topbar] select { min-width: 0; max-width: 120px; }
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

[data-scrum-list-bar] {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
[data-scrum-list-bar] > p { margin-right: auto; color: var(--scrum-muted); }

[data-scrum-batch] {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 10px 14px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius);
  background: var(--scrum-panel-subtle);
}
[data-scrum-batch="none"] { color: var(--scrum-muted); font-size: 12px; }
[data-scrum-batch-count] { margin-right: auto; font-weight: 650; }
[data-scrum-batch] p { display: grid; gap: 6px; margin: 0; }

/* Every field's control is rendered; only the chosen one is shown. Hiding
   with CSS keeps each control named apart in the form. */
[data-scrum-batch-value] { display: none !important; }
[data-scrum-batch]:has(#scrum-batch-field option[value="status"]:checked)
  [data-scrum-batch-value="status"],
[data-scrum-batch]:has(#scrum-batch-field option[value="priority"]:checked)
  [data-scrum-batch-value="priority"],
[data-scrum-batch]:has(#scrum-batch-field option[value="sprint"]:checked)
  [data-scrum-batch-value="sprint"],
[data-scrum-batch]:has(#scrum-batch-field option[value="assignee"]:checked)
  [data-scrum-batch-value="assignee"],
[data-scrum-batch]:has(#scrum-batch-field option[value="addLabel"]:checked)
  [data-scrum-batch-value="addLabel"],
[data-scrum-batch]:has(#scrum-batch-field option[value="removeLabel"]:checked)
  [data-scrum-batch-value="removeLabel"] {
  display: grid !important;
}

[data-scrum-batch-outcome] {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-left: 3px solid var(--scrum-accent);
  background: var(--scrum-panel-subtle);
}
[data-scrum-batch-outcome][data-scrum-batch-refused="0"] { border-left-color: var(--scrum-accent); }
[data-scrum-batch-outcome]:not([data-scrum-batch-refused="0"]) {
  border-left-color: var(--scrum-warning);
}
[data-scrum-batch-refusal] { color: var(--scrum-warning); font-size: 12px; }

[data-scrum-list] th[data-scrum-column="mark"],
[data-scrum-list] td[data-scrum-column="mark"] { width: 32px; text-align: center; }

[data-scrum-projection] {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 12px;
  padding: 3px;
  border: 1px solid var(--scrum-border);
  border-radius: 999px;
  background: var(--scrum-panel-subtle);
}
[data-scrum-projection-tab] { min-height: 30px; border: 0; border-radius: 999px; background: transparent; }
[data-scrum-projection-tab][aria-selected="true"] {
  background: var(--scrum-panel);
  border: 1px solid var(--scrum-border);
}

[data-scrum-timeline="grid"] { display: grid; gap: 10px; }

/* The lane the bars are read against. Equal columns because a sprint is a
   fixed-length box in this grid, not a proportional one. */
[data-scrum-timeline-axis] {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 1px;
  margin-inline-start: 260px;
  padding: 4px 0;
  border-block: 1px solid var(--scrum-border);
  color: var(--scrum-muted);
  font-size: 12px;
  text-align: center;
}

[data-scrum-timeline-rows] ul { padding-inline-start: 0; }

[data-scrum-timeline-row] {
  display: grid;
  grid-template-columns: 260px 1fr 90px;
  align-items: center;
  gap: 10px;
  padding: 3px 0;
}
[data-scrum-timeline-row] > ul { grid-column: 1 / -1; }

[data-scrum-timeline-label] {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-scrum-timeline-track] {
  position: relative;
  height: 14px;
  border-radius: 999px;
  background: var(--scrum-panel-subtle);
}
[data-scrum-timeline-track] > span {
  position: absolute;
  top: 2px;
  bottom: 2px;
  border-radius: 999px;
  background: var(--scrum-accent-soft);
}
[data-scrum-depth="0"] [data-scrum-timeline-track] > span { background: var(--scrum-accent); }

[data-scrum-timeline-meta] { color: var(--scrum-muted); font-size: 12px; text-align: end; }

[data-scrum-timeline-unscheduled] {
  padding: 12px 14px;
  border: 1px dashed var(--scrum-border);
  border-radius: var(--scrum-radius);
}
[data-scrum-timeline-unscheduled] p { color: var(--scrum-muted); font-size: 12px; }
[data-scrum-timeline="no-sprints"] p,
[data-scrum-timeline-empty] { color: var(--scrum-muted); }

[data-scrum-definition-of-ready] {
  padding: 12px 14px;
  margin-bottom: 12px;
  border: 1px dashed var(--scrum-border);
  border-radius: var(--scrum-radius);
}
[data-scrum-definition-of-ready] p { color: var(--scrum-muted); font-size: 12px; margin: 4px 0 8px; }
[data-scrum-definition-of-ready] li { padding: 2px 0; }
[data-scrum-definition-of-ready] li::before { content: '□ '; color: var(--scrum-muted); }

[data-scrum-readiness] {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
}
[data-scrum-readiness="ready"] {
  color: var(--scrum-success);
  background: color-mix(in srgb, var(--scrum-success) 12%, transparent);
}
[data-scrum-readiness="incomplete"] {
  color: var(--scrum-warning);
  background: color-mix(in srgb, var(--scrum-warning) 12%, transparent);
}

[data-scrum-plan-field] { display: inline-flex; align-items: center; gap: 6px; }
[data-scrum-plan-field] label { font-size: 12px; }
[data-scrum-plan-empty] { color: var(--scrum-muted); font-size: 12px; }

[data-scrum-board-bar] {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
[data-scrum-board-bar] > h3 { margin-right: auto; }

[data-scrum-lane] + [data-scrum-lane] { margin-top: 14px; }
[data-scrum-lane] > h4 {
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--scrum-border);
  color: var(--scrum-muted);
  font-size: 12px;
}

[data-scrum-over-limit] {
  margin-top: 4px;
  color: var(--scrum-warning);
  font-size: 12px;
}
[data-scrum-column]:has([data-scrum-over-limit]) {
  border-color: color-mix(in srgb, var(--scrum-warning) 55%, var(--scrum-border));
}

[data-scrum-settings-page] { display: grid; gap: 14px; max-width: 920px; }

[data-scrum-settings="ready"] { display: grid; gap: 14px; justify-items: start; }

[data-scrum-settings-section] {
  display: grid;
  gap: 12px;
  width: 100%;
  padding: 16px 18px;
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius);
  background: var(--scrum-panel);
}
[data-scrum-settings-section] legend {
  padding: 0 6px;
  font-size: 13px;
  font-weight: 650;
}
[data-scrum-settings-section] p { display: grid; gap: 6px; margin: 0; }
[data-scrum-settings-section] input[type="number"] { max-width: 140px; }
[data-scrum-settings-section] textarea { min-height: 90px; }
[data-scrum-hint] { color: var(--scrum-muted); font-size: 12px; }

[data-scrum-capabilities] { display: flex; flex-wrap: wrap; gap: 6px; }
[data-scrum-capability] {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--scrum-panel-subtle);
  font-size: 12px;
}

[data-scrum-settings-saved] { color: var(--scrum-success); }
[data-scrum-settings-failure] {
  width: 100%;
  padding: 10px 14px;
  border-left: 3px solid var(--scrum-danger);
  background: var(--scrum-panel-subtle);
}
`
