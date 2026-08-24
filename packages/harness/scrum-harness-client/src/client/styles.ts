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
  /*
   * Height, told twice.
   *
   * A shadow is the light theme's half of it. The dark theme's half is the
   * surface itself getting lighter, which is how the host's own layers work --
   * bg-layer-2 sits above bg-layer-1 sits above the page -- and it is the half
   * this sheet was missing, so a drawer over a near-black page was carrying a
   * near-black shadow and reading as flat.
   *
   * Both steps are lit from directly above, and each offset clears half its own
   * blur, so they read as one light source rather than as haze.
   */
  --scrum-panel-raised: var(--dsw-alias-bg-layer-2, color-mix(in srgb, CanvasText 4%, Canvas));
  /*
   * A filled control and the text on it, taken as a pair.
   *
   * The primary buttons were the accent with white forced on top. That pairing
   * is the shell's accent, not the shell's primary button -- the host fills one
   * with brand-primary and puts label-primary-foreground on it -- and white on
   * the accent measures about 4.2:1 in the light theme, under the floor, while
   * in the dark theme the accent lightens to #679efe and white on it is worse
   * still. The host's own pair inverts with the theme and clears the floor at
   * both ends, which the Canvas/CanvasText fallback also does.
   */
  --scrum-primary-fill: var(--dsw-alias-button-primary-fill, CanvasText);
  --scrum-primary-hover: var(--dsw-alias-button-primary-hover, color-mix(in srgb, CanvasText 85%, Canvas));
  --scrum-primary-label: var(--dsw-alias-label-primary-foreground, Canvas);
  --scrum-mask: var(--dsw-alias-bg-mask-1, rgb(0 0 0 / 24%));
  --scrum-skeleton: var(--dsw-alias-bg-skeleton, color-mix(in srgb, CanvasText 8%, transparent));
  --scrum-shadow-sm: 0 2px 3px rgb(0 0 0 / 6%);
  --scrum-shadow-lg: 0 6px 8px rgb(0 0 0 / 6%), 0 24px 40px rgb(0 0 0 / 14%);

  /*
   * Spacing on a 4px step, so that two gaps either read as the same
   * relationship or as an obviously different one. The sheet had been written
   * with whatever number looked right at each site -- 7, 9, 11, 13, 15, 17 --
   * which is what makes grouping unreadable: 12 beside 13 says nothing.
   */
  --scrum-space-1: 4px;
  --scrum-space-2: 8px;
  --scrum-space-3: 12px;
  --scrum-space-4: 16px;
  --scrum-space-5: 24px;
  --scrum-space-6: 32px;
  --scrum-space-7: 48px;
  --scrum-space-8: 64px;

  /* Three steps, so a control nested in a card can always take the smaller. */
  --scrum-radius-sm: 4px;
  --scrum-radius-md: 8px;
  --scrum-radius-lg: 16px;
  --scrum-radius: var(--scrum-radius-lg);

  /*
   * One ladder for everything that leaves the flow. Both dialogs used to sit
   * at 5, so which one drew on top was whichever the document happened to
   * paint last. An alertdialog interrupts whatever is open, the leave question
   * included, so it outranks the rest rather than tying with them.
   */
  --scrum-z-drawer: 10;
  --scrum-z-mask: 20;
  --scrum-z-dialog: 30;
  --scrum-z-alert: 40;

  --scrum-text-xs: 12px;
  --scrum-text-sm: 13px;
  --scrum-text-md: 14px;
  --scrum-text-lg: 16px;
  --scrum-text-xl: 20px;

  /* The shell's own motion, so a Scrum control settles like a shell control. */
  --scrum-motion: var(--ds-transition-duration-fast, 140ms) var(--ds-ease-in-out, ease);

  --scrum-content-padding: clamp(24px, 3vw, 40px);
  color: var(--dsw-alias-label-primary, CanvasText);
  font-family: inherit;
  font-size: var(--scrum-text-md);
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
  padding: var(--scrum-space-2) var(--scrum-space-3);
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius-md);
  background: var(--scrum-panel);
  color: inherit;
  cursor: pointer;
  transition: border-color var(--scrum-motion), background var(--scrum-motion),
    transform var(--scrum-motion);
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
  padding: var(--scrum-space-2) var(--scrum-space-3);
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius-md);
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
  margin: 0;
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
  padding: var(--scrum-space-1) 28px var(--scrum-space-1) var(--scrum-space-2);
  border: 0;
  border-radius: var(--scrum-radius-md);
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
  margin: 16px clamp(20px, 3vw, 40px) 0;
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

[data-scrum-overlay] [data-scrum-project] {
  width: fit-content;
  margin-top: var(--scrum-space-1);
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
[data-scrum-project-heading] > [data-scrum-project] { margin: 0; }
[data-scrum-project-edit] { margin-left: auto; }
[data-scrum-home] > h3 { margin-top: 24px; font-size: 15px; }
[data-scrum-home] > p { max-width: 680px; color: var(--scrum-muted); white-space: pre-wrap; }

[data-scrum-dashboard] {
  display: grid;
  gap: var(--scrum-space-5);
  margin-top: var(--scrum-space-5);
}

[data-scrum-dashboard] > section {
  padding: var(--scrum-space-4);
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius);
  background: var(--scrum-panel);
}

[data-scrum-dashboard] h3 {
  font-size: var(--scrum-text-lg);
  margin-bottom: var(--scrum-space-2);
}
[data-scrum-dashboard] h4 { font-size: var(--scrum-text-md); }

[data-scrum-sprint-totals],
[data-scrum-burndown] dl {
  display: flex;
  flex-wrap: wrap;
  gap: var(--scrum-space-1) var(--scrum-space-5);
  margin-top: var(--scrum-space-2);
}
[data-scrum-sprint-totals] dt,
[data-scrum-burndown] dt { color: var(--scrum-muted); }
[data-scrum-sprint-totals] dd,
[data-scrum-burndown] dd { margin: 0 0 0 var(--scrum-space-1); font-variant-numeric: tabular-nums; }

/* The bar is the burndown: a filled length for what is left, and a marker
   where an even spread would have it by now. */
[data-scrum-burndown-bar] {
  position: relative;
  height: 10px;
  margin: var(--scrum-space-3) 0 var(--scrum-space-2);
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
[data-scrum-burndown-note] { color: var(--scrum-muted); font-size: var(--scrum-text-xs); }
[data-scrum-scope-change] { color: var(--scrum-warning); }

[data-scrum-signal] {
  padding: var(--scrum-space-3) 0;
  border-top: 1px solid var(--scrum-border);
}
[data-scrum-signal]:first-child { border-top: 0; padding-top: 0; }
[data-scrum-signal] > p {
  color: var(--scrum-muted);
  font-size: var(--scrum-text-xs);
  margin-bottom: var(--scrum-space-1);
}
[data-scrum-signal] li,
[data-scrum-activity] li {
  display: flex;
  gap: var(--scrum-space-3);
  align-items: baseline;
  padding: var(--scrum-space-1) 0;
}
[data-scrum-signal] [data-scrum-meta],
[data-scrum-activity-at],
[data-scrum-activity-action] {
  color: var(--scrum-muted);
  font-size: var(--scrum-text-xs);
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
[data-scrum-overlay] [data-scrum-project-save] {
  border-color: transparent;
  background: var(--scrum-primary-fill);
  color: var(--scrum-primary-label);
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
/*
 * Nine controls, packed by how much room there is rather than by a breakpoint.
 *
 * Wrapping a flex row put each control on its own line the moment the row ran
 * out, so a narrow shell got a nine-row column of full-width selects. Tracks
 * that divide the available width fill each line before starting another, and
 * the arrangement changes at whatever width the content runs out at instead of
 * at a number copied from a device.
 */
[data-scrum-filter-bar] {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  align-items: end;
  gap: var(--scrum-space-3) var(--scrum-space-4);
  flex: 1 1 100%;
}

/* The one field worth two, since it is typed into rather than picked from. */
[data-scrum-filter-field]:has(input[type="search"]) { grid-column: span 2; }

[data-scrum-filter-field] { display: grid; gap: var(--scrum-space-1); }

/*
 * The blocked box, which is a field that *is* a checkbox. The multi-value
 * fields merely contain some once open, and a descendant :has would catch an
 * open panel and lay its field out as though the panel were the control.
 */
[data-scrum-filter-field]:has(> input[type="checkbox"]) {
  display: flex;
  align-items: center;
  min-height: 40px;
  gap: var(--scrum-space-2);
  white-space: nowrap;
}

/*
 * A dimension with several values, collapsed.
 *
 * The trigger takes the height of the selects beside it rather than the 36px
 * a button takes, because what makes a row of controls read as one row is
 * that they all end on the same line. Its label is a span rather than a
 * label element -- a label cannot point at a button -- so it restates what
 * the baseline gives the others.
 */
[data-scrum-filter-field][data-scrum-multi] { position: relative; }

[data-scrum-multi-label] {
  font-size: var(--scrum-text-sm);
  font-weight: 650;
  color: var(--scrum-muted);
}

[data-scrum-multi-trigger] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--scrum-space-2);
  width: 100%;
  min-height: 40px;
  text-align: start;
}

/* The summary yields before the bar does, so a long one cannot widen a track. */
[data-scrum-multi-summary] {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The mark a select draws, since the control answers the same question. */
[data-scrum-multi-trigger]::after {
  content: "";
  flex: none;
  width: 7px;
  height: 7px;
  border-right: 1px solid currentColor;
  border-bottom: 1px solid currentColor;
  transform: translateY(-2px) rotate(45deg);
  transition: transform var(--scrum-motion);
}
[data-scrum-multi-trigger][aria-expanded="true"]::after {
  transform: translateY(2px) rotate(-135deg);
}

/*
 * The panel leaves the flow, so opening one does not reflow the bar under it
 * and move the control the pointer is already on. It is a raised surface
 * rather than a bordered one, which is how the shell says a thing is above
 * the page in both themes.
 */
[data-scrum-multi-panel] {
  position: absolute;
  top: calc(100% + var(--scrum-space-1));
  inset-inline-start: 0;
  z-index: var(--scrum-z-drawer);
  min-width: 100%;
  max-height: calc(var(--scrum-space-8) * 4);
  padding: var(--scrum-space-1);
  overflow-y: auto;
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius-md);
  background: var(--scrum-panel-raised);
  box-shadow: var(--scrum-shadow-lg);
}

[data-scrum-multi-option] {
  display: flex;
  align-items: center;
  gap: var(--scrum-space-2);
  min-height: 32px;
  padding: 0 var(--scrum-space-2);
  border-radius: var(--scrum-radius-sm);
  cursor: pointer;
  /*
   * The bar's labels name fields and stay quiet. These are the values, and
   * are the text actually being read, so they take the body size and weight
   * back from the baseline's label rule.
   */
  font-size: var(--scrum-text-md);
  font-weight: 400;
  color: var(--dsw-alias-label-primary, CanvasText);
  white-space: nowrap;
}

[data-scrum-multi-option] input { flex: none; }
[data-scrum-multi-option]:hover { background: var(--scrum-hover); }
[data-scrum-multi-option]:has(input:checked) { background: var(--scrum-accent-soft); }

/*
 * What the bar is doing, and the way out of it, on their own line.
 *
 * As grid items they each took a track, which left "nothing is narrowed"
 * stranded mid-row with empty space on both sides of it and moved the clear
 * button to wherever the wrap happened to end.
 */
[data-scrum-filter-none],
[data-scrum-filter-clear] {
  grid-column: 1 / -1;
  justify-self: start;
}
[data-scrum-filter-none] {
  color: var(--scrum-muted);
  font-size: var(--scrum-text-xs);
}

[data-scrum-overlay] label,
[data-scrum-overlay] legend { font-size: 13px; font-weight: 650; color: var(--scrum-muted); }

[data-scrum-overlay] [data-scrum-create-open],
[data-scrum-overlay] [data-scrum-sprint-create-open],
[data-scrum-overlay] [data-scrum-submit],
[data-scrum-overlay] [data-scrum-item-submit],
[data-scrum-overlay] [data-scrum-sprint-submit],
[data-scrum-overlay] [data-scrum-transition] {
  width: fit-content;
  border-color: transparent;
  background: var(--scrum-primary-fill);
  color: var(--scrum-primary-label);
  font-weight: 700;
}

/*
 * The baseline hover tints towards the accent, which on a filled control would
 * wash the fill rather than deepen it. A primary button darkens instead.
 */
[data-scrum-overlay] [data-scrum-project-save]:hover:not(:disabled),
[data-scrum-overlay] [data-scrum-create-open]:hover:not(:disabled),
[data-scrum-overlay] [data-scrum-sprint-create-open]:hover:not(:disabled),
[data-scrum-overlay] [data-scrum-submit]:hover:not(:disabled),
[data-scrum-overlay] [data-scrum-item-submit]:hover:not(:disabled),
[data-scrum-overlay] [data-scrum-sprint-submit]:hover:not(:disabled),
[data-scrum-overlay] [data-scrum-transition]:hover:not(:disabled) {
  border-color: transparent;
  background: var(--scrum-primary-hover);
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

[data-scrum-list="items"] { display: grid; gap: var(--scrum-space-4); }
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
  gap: var(--scrum-space-2);
  min-width: 0;
  padding: var(--scrum-space-3) var(--scrum-space-4);
  border-top: 1px solid var(--scrum-border);
  transition: background var(--scrum-motion), border-color var(--scrum-motion);
}

/*
 * A row lies straight on a panel with no fill of its own, so it takes the
 * host's translucent hover tint. A board card brings its own fill, and a
 * translucent tint would replace that rather than sit over it, so what moves
 * there is the border.
 */
[data-scrum-row]:hover { background: var(--scrum-hover); }

[data-scrum-column] [data-scrum-card]:hover {
  border-color: color-mix(in srgb, var(--scrum-accent) 45%, var(--scrum-border));
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
[data-scrum-list="empty"] {
  padding: var(--scrum-space-7) var(--scrum-space-5);
  border: 1px dashed var(--scrum-border);
  border-radius: var(--scrum-radius);
  text-align: center;
  color: var(--scrum-muted);
}

[data-scrum-empty] h3 { margin-bottom: var(--scrum-space-2); color: inherit; }

/*
 * Loading is not an empty state and no longer borrows its card. An empty page
 * is an outcome and is worth framing; a page still arriving is a page, and the
 * skeleton under the message is already saying so.
 */
[data-scrum-loading],
[data-scrum-list="loading"],
[data-scrum-timeline="loading"] {
  display: block;
  color: var(--scrum-muted);
}

[data-scrum-skeleton] {
  display: grid;
  gap: var(--scrum-space-2);
  margin-top: var(--scrum-space-3);
}

[data-scrum-skeleton-row] {
  height: 14px;
  border-radius: var(--scrum-radius-sm);
  background: var(--scrum-skeleton);
  animation: scrum-skeleton-pulse 1.6s var(--ds-ease-in-out, ease-in-out) infinite;
}

/* Bars of one length read as a chart. Ragged ends read as text not yet here. */
[data-scrum-skeleton-row]:nth-child(3n) { width: 78%; }
[data-scrum-skeleton-row]:nth-child(3n + 2) { width: 91%; }

@keyframes scrum-skeleton-pulse {
  50% { opacity: 0.5; }
}

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
  gap: var(--scrum-space-2);
  padding: var(--scrum-space-5);
  border-radius: var(--scrum-radius);
  background: linear-gradient(135deg, color-mix(in srgb, var(--scrum-accent) 14%, var(--scrum-panel)), var(--scrum-panel));
  border: 1px solid color-mix(in srgb, var(--scrum-accent) 24%, var(--scrum-border));
}

[data-scrum-sprint-dates],
[data-scrum-sprint-progress] {
  color: var(--scrum-muted);
  font-size: var(--scrum-text-sm);
}
[data-scrum-columns] {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(220px, 1fr);
  gap: var(--scrum-space-3);
  overflow-x: auto;
  padding-bottom: var(--scrum-space-2);
}

[data-scrum-column] {
  min-width: 220px;
  padding: var(--scrum-space-3);
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius);
  background: var(--scrum-panel-subtle);
}

[data-scrum-column] > h4 { display: inline; font-size: var(--scrum-text-sm); }
[data-scrum-column] > [data-scrum-totals] { display: inline; margin-left: var(--scrum-space-2); }
[data-scrum-column] > ul { display: grid; gap: var(--scrum-space-2); margin-top: var(--scrum-space-3); }
[data-scrum-column] [data-scrum-card] {
  display: grid;
  grid-template-columns: 1fr auto;
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius-md);
  background: var(--scrum-panel);
}

[data-scrum-column] [data-scrum-card] > button:first-child { grid-column: 1 / -1; }
[data-scrum-column] [data-scrum-card] > span:last-child {
  grid-column: 1 / -1;
  display: grid;
  gap: var(--scrum-space-1);
}

/*
 * The move control, quieted.
 *
 * Every card carries one, because dragging is the single gesture no keyboard
 * can reach and the select names where a card can go before the pointer is
 * over it. Twelve cards then meant twelve full-size bordered dropdowns
 * competing with the twelve titles that are what the column is scanned for.
 *
 * Quieted, not hidden: it keeps its label, its size and its place in the tab
 * order, and it comes back to full strength on hover and on keyboard focus.
 * A control that only existed on hover would not exist at all on a touch
 * screen, which is the trap this board already refused once by not using drag.
 */
[data-scrum-column] [data-scrum-card] select {
  min-height: 28px;
  border-color: transparent;
  background: transparent;
  color: var(--scrum-muted);
  font-size: var(--scrum-text-xs);
}

[data-scrum-column] [data-scrum-card]:hover select,
[data-scrum-column] [data-scrum-card] select:focus-visible {
  border-color: var(--scrum-border);
  background: var(--scrum-panel);
  color: inherit;
}

[data-scrum-planning] {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--scrum-space-4);
}
[data-scrum-pane] {
  padding: var(--scrum-space-4);
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius);
  background: var(--scrum-panel);
}

[data-scrum-pane] > h4 { margin-bottom: var(--scrum-space-2); }
[data-scrum-pane] [data-scrum-row] { padding-inline: 0; }

[data-scrum-detail] {
  position: fixed;
  z-index: var(--scrum-z-drawer);
  top: 16px;
  right: 16px;
  bottom: 16px;
  width: min(520px, calc(100vw - 32px));
  overflow: auto;
  padding: var(--scrum-space-5);
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius-lg);
  background: var(--scrum-panel-raised);
  box-shadow: var(--scrum-shadow-lg);
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
  padding: var(--scrum-space-4);
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius-md);
  background: var(--scrum-panel-subtle);
}

[data-scrum-access-modes] p span { grid-column: 2; color: var(--scrum-muted); font-size: 12px; }
[data-scrum-access-effective] {
  width: fit-content;
  padding: var(--scrum-space-2) var(--scrum-space-3);
  border-radius: var(--scrum-radius-md);
  background: var(--scrum-panel-subtle);
}

[data-scrum-failure],
[data-scrum-error],
[data-scrum-create-failure],
[data-scrum-list="failed"],
[data-scrum-moved] {
  padding: var(--scrum-space-3) var(--scrum-space-4);
  border: 1px solid color-mix(in srgb, var(--scrum-danger) 35%, var(--scrum-border));
  border-radius: var(--scrum-radius-md);
  background: color-mix(in srgb, var(--scrum-danger) 8%, var(--scrum-panel));
}

[data-scrum-failure] { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
[data-scrum-failure] p:nth-child(2) { flex: 1; min-width: 240px; }

[data-scrum-overlay] [data-scrum-refresh],
[data-scrum-overlay] [data-scrum-dismiss] {
  min-height: 32px;
  padding: var(--scrum-space-1) var(--scrum-space-3);
  font-size: var(--scrum-text-sm);
}

[data-scrum-leave], [data-scrum-confirm] {
  position: fixed;
  z-index: var(--scrum-z-dialog);
  top: 50%;
  left: 50%;
  width: min(460px, calc(100vw - 32px));
  padding: var(--scrum-space-5);
  border: 1px solid var(--scrum-border);
  border-radius: var(--scrum-radius-lg);
  background: var(--scrum-panel-raised);
  box-shadow: var(--scrum-shadow-lg);
  transform: translate(-50%, -50%);
}

[data-scrum-leave] { z-index: var(--scrum-z-alert); }

/*
 * The backdrop both dialogs declare and neither had.
 *
 * They render aria-modal, and until now the page behind stayed visible,
 * clickable and scrollable -- a modality announced to screen readers that
 * nothing else honoured. A fixed layer over the whole shell separates them
 * visually and stops the clicks in one go.
 *
 * It hangs off the overlay rather than off the dialogs: those are centred with
 * a transform, which makes them the containing block for anything fixed inside
 * them, so a backdrop of their own would cover only themselves. It sits above
 * the drawer as well, because a question raised over an open drawer is asked
 * about that drawer too.
 */
[data-scrum-overlay]:has([data-scrum-leave], [data-scrum-confirm])::before {
  content: "";
  position: fixed;
  z-index: var(--scrum-z-mask);
  inset: 0;
  background: var(--scrum-mask);
}

[data-scrum-leave] h2, [data-scrum-confirm] h3 { margin-bottom: 8px; }
[data-scrum-leave] p, [data-scrum-confirm] > p { margin-bottom: 18px; color: var(--scrum-muted); }
[data-scrum-leave] button + button, [data-scrum-confirm] button + button { margin-left: 8px; }

@media (max-width: 900px) {
  [data-scrum-columns] { grid-auto-columns: minmax(250px, 78vw); }
  [data-scrum-planning] { grid-template-columns: 1fr; }
}

@media (max-width: 620px) {
  [data-scrum-workbench] > [data-scrum-topbar] { padding-right: 20px; }
  [data-scrum-topbar] select { min-width: 0; max-width: 120px; }
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
  [data-scrum-overlay] * {
    scroll-behavior: auto !important;
    transition: none !important;
    animation: none !important;
  }
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
[data-scrum-batch] [data-scrum-batch-value] { display: none; }
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
  display: grid;
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

/*
 * The work item table.
 *
 * Eleven columns do not fit a narrow shell, so the table scrolls inside itself
 * rather than widening the page around it: as a block box it takes the width it
 * is given and the row content overflows within, which is the whole of the
 * narrow-screen story here. Stacking the columns into cards would be a second
 * layout to keep true, and this table is the data floor the other three
 * projections are read against -- it has to keep showing every column.
 */
[data-scrum-list] table {
  display: block;
  width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
}

[data-scrum-list] th,
[data-scrum-list] td {
  padding: var(--scrum-space-2) var(--scrum-space-3);
  border-top: 1px solid var(--scrum-border);
  text-align: start;
  vertical-align: middle;
  white-space: nowrap;
}

/*
 * The heading band stays while the body scrolls under it. Sticky needs
 * something opaque to travel over, so the band carries its own fill rather
 * than inheriting the page's.
 */
[data-scrum-list] thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  border-top: 0;
  border-bottom: 1px solid var(--scrum-border);
  background: var(--scrum-panel-subtle);
  box-shadow: var(--scrum-shadow-sm);
  color: var(--scrum-muted);
  font-size: var(--scrum-text-xs);
  font-weight: 650;
}

/*
 * Both controls inside the table were taking the global button chrome, so
 * every heading and every id cell drew a bordered 36px control. A heading that
 * sorts and an id that opens are affordances on the text, not buttons around
 * it; the focus ring from the baseline still reports where the keyboard is.
 */
[data-scrum-list] th > button,
[data-scrum-list] td[data-scrum-column="id"] > button {
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: var(--scrum-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: inherit;
}

[data-scrum-list] th > button:hover:not(:disabled),
[data-scrum-list] td[data-scrum-column="id"] > button:hover:not(:disabled) {
  border-color: transparent;
  background: transparent;
  text-decoration: underline;
}

[data-scrum-list] td[data-scrum-column="id"] > button {
  color: var(--scrum-accent);
  font-weight: 650;
}

/* The one column that carries prose, and so the one that may wrap. */
[data-scrum-list] td[data-scrum-column="title"] {
  min-width: 220px;
  white-space: normal;
}

/* Digits that line up column-wise, so lengths can be compared by eye. */
[data-scrum-list] td[data-scrum-column="id"],
[data-scrum-list] td[data-scrum-column="estimate"],
[data-scrum-list] td[data-scrum-column="updated"] {
  font-variant-numeric: tabular-nums;
}

[data-scrum-list] td[data-scrum-column="updated"] { color: var(--scrum-muted); }

[data-scrum-list] tbody tr:hover { background: var(--scrum-hover); }
[data-scrum-list] tbody tr[aria-selected="true"] {
  background: color-mix(in srgb, var(--scrum-accent) 10%, transparent);
}

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

[data-scrum-timeline="grid"] {
  --scrum-timeline-label: 260px;
  display: grid;
  gap: var(--scrum-space-2);
}

/* The lane the bars are read against. Equal columns because a sprint is a
   fixed-length box in this grid, not a proportional one. */
[data-scrum-timeline-axis] {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 1px;
  margin-inline-start: var(--scrum-timeline-label);
  padding: var(--scrum-space-1) 0;
  border-block: 1px solid var(--scrum-border);
  color: var(--scrum-muted);
  font-size: var(--scrum-text-xs);
  text-align: center;
}

[data-scrum-timeline-rows] ul { padding-inline-start: 0; }

[data-scrum-timeline-row] {
  display: grid;
  grid-template-columns: var(--scrum-timeline-label) 1fr 90px;
  align-items: center;
  gap: var(--scrum-space-2);
  padding: var(--scrum-space-1) 0;
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

[data-scrum-timeline-meta] {
  color: var(--scrum-muted);
  font-size: var(--scrum-text-xs);
  text-align: end;
}

[data-scrum-timeline-unscheduled] {
  padding: var(--scrum-space-3) var(--scrum-space-4);
  border: 1px dashed var(--scrum-border);
  border-radius: var(--scrum-radius);
}
[data-scrum-timeline-unscheduled] p {
  color: var(--scrum-muted);
  font-size: var(--scrum-text-xs);
}
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

[data-scrum-column] [data-scrum-card] label {
  font-size: var(--scrum-text-xs);
  font-weight: 500;
}

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
