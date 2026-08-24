# Harness Theme Tokens

This repository already has a design system. Do not introduce a second palette,
a token file of literal colours, or a CSS framework beside it.

The sheet is `packages/harness/scrum-harness-client/src/client/styles.ts`, one
string scoped to `[data-scrum-overlay]`. Read it before adding a colour, a gap
or a radius; the comments there carry the reasoning this file only summarises.

## The binding rule

Every Scrum token is an alias of a host token, with a fallback:

```css
--scrum-panel: var(--dsw-alias-bg-layer-1, Canvas);
```

Three rules hold it together:

1. **Check the host token exists.** A `var()` naming a token `ui-theme` does not
   publish is not an error anybody sees. It silently takes the fallback, and the
   surface drifts away from the shell while the stylesheet still reads as
   themed.
2. **Fall back to a system colour, not a literal**, wherever a literal would
   pair a fixed surface with an inherited foreground. The shell sets the
   document's `color-scheme`, so `Canvas` and `CanvasText` flip with the theme
   and any pair derived from them agrees with itself. The exceptions are the
   hues, which no system colour expresses; those carry the theme's own value.
3. **Take pairs from the host, not from taste.** A filled control and its label
   are one decision. Accent plus forced white measures about 4.2:1 in the light
   theme and worse in the dark one; `--dsw-alias-button-primary-fill` with
   `--dsw-alias-label-primary-foreground` inverts with the theme and clears the
   floor at both ends.

## What is already defined

Colour: `--scrum-accent`, `--scrum-accent-soft`, `--scrum-panel`,
`--scrum-panel-subtle`, `--scrum-panel-raised`, `--scrum-border`,
`--scrum-muted`, `--scrum-hover`, `--scrum-mask`, `--scrum-skeleton`,
`--scrum-danger`, `--scrum-warning`, `--scrum-success`,
`--scrum-primary-fill`, `--scrum-primary-hover`, `--scrum-primary-label`.

Space: `--scrum-space-1` … `--scrum-space-8` on a 4px step. Two gaps should
read either as the same relationship or as an obviously different one; 12
beside 13 says nothing.

Radius: `--scrum-radius-sm|md|lg`, three steps so a control nested in a card can
always take the smaller.

Type: `--scrum-text-xs|sm|md|lg|xl`.

Elevation: `--scrum-shadow-sm`, `--scrum-shadow-lg`, plus the raised surface.
Height is told twice — a shadow is the light theme's half, a lighter surface is
the dark theme's half. A shadow alone reads as flat over a near-black page.

Layering: `--scrum-z-drawer` 10, `--scrum-z-mask` 20, `--scrum-z-dialog` 30,
`--scrum-z-alert` 40. One ladder, so paint order never decides which dialog
wins.

Motion: `--scrum-motion`, bound to the shell's own duration and easing.

## Adding one

Only when no existing token says it. Then: find the host alias, verify it in
the theme package, give it a fallback that survives a shell composed without
`ui-theme`, and say in a comment what the token is for rather than what its
value is.
