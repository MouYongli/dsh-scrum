# The Scrum Surface in This Repository

The generic guidance in this Skill describes Harness plugin UI in general. This
file records what the Scrum plugin in this repository actually is, so the Skill
never proposes a structure the host cannot mount.

The authority is [开发指南](../../../../docs/development/dsh-dev-guide.md); the
sections named below are the ones to read before changing anything. This file
records only the shape the Skill needs and links out for the reasoning.

## Where the UI lives

Two packages, split at the browser boundary:

| Package | Holds |
|---|---|
| `packages/ui/scrum-ui` | React components and view models, no Harness context, no file or network access |
| `packages/harness/scrum-harness-client` | Slot registration, the transport to the Host, and the stylesheet |

`scrum-ui` must stay renderable without a Harness shell — that is what keeps it
testable. Anything that needs `ctx` belongs in the client package.

React 18 with `createElement`, no JSX build step, no Tailwind and no CSS-in-JS
runtime. The stylesheet is one string in
`packages/harness/scrum-harness-client/src/client/styles.ts`.

## Mount points

Four Slots, per 开发指南 section 5:

```text
sidebar.footer.action     Scrum entry, beside Settings
shell.overlay             the Scrum workbench, a root-level overlay
conversation.input.dock   focus item chip for the current session (optional)
tool.call.toolview        Scrum tool call cards, registered by tool name
```

What follows from that, and cannot be designed away:

- Scrum is a **mode beside conversation**, not a dismissible dialog. The shell
  is either in conversation or in Scrum.
- The overlay renders nothing in conversation mode, so **entering Scrum is
  always a fresh mount**. Tab, filter and selection state does not survive a
  mode switch. Do not design a flow that assumes it does.
- The entry sits at the bottom of the sidebar because the host opens no top
  action Slot. It must render in **both** modes — the overlay measures its left
  edge from it — and it must carry a selected state in Scrum mode.
- A collapsed sidebar drops `wide` to `false`; the entry degrades to an icon on
  its own.
- The workbench must work with no session at all.

## Pages

Six sections in the workbench tab strip, in this order
(`packages/ui/scrum-ui/src/workbench.ts`):

| Id | 中文 | English |
|---|---|---|
| `dashboard` | 仪表盘 | Dashboard |
| `items` | 工作项 | Work items |
| `backlog` | 产品 Backlog | Product backlog |
| `sprint` | Sprint 看板 | Sprint board |
| `review` | 回顾 | Review |
| `settings` | 设置 | Settings |

The order is the reading order from `docs/product/scrum.md` 5.1: what is next,
what is happening, what happened.

The Scrum agent is **not** a section and has no action in the workbench header.
Agent work remains in Harness conversations rather than competing with project
navigation. Work item detail is the workbench's own drawer; it does not reuse
the conversation's tool detail panel.

So the Overview / Tasks / Runs / Artifacts / Settings information architecture
in `harness-plugin-ui.md` is the generic case, not this plugin. Do not import
it here.

## First-run states

`packages/ui/scrum-ui/src/pages.ts` maps an entry state onto a page, and the
union has no default branch, so a host state with no page here fails to
compile. The states are `no-workspace`, `unbound`, `stale`, `archived` and
`bound`; 开发指南 section 7 describes what each one shows.

Every new state needs its page in the same file rather than an inline branch in
a component.

## Leaving Scrum

- Clicking a session row, `＋ New Session`, or connecting a workspace all
  surface as one thing: a change of `current` in the `sessions.list` snapshot.
  The host publishes no selection event.
- A list still in `phase: 'pending'`, and the host's own boot selection, are
  **not** navigation. Neither may eject somebody who just entered Scrum.
- Esc returns to conversation, but must pass through the keystroke an IME holds
  (`isComposing` or `keyCode === 229`) and one an inner handler already called
  `preventDefault` on, and must listen on the bubble phase. Capture would take
  Esc away from the workbench's own text inputs, and this UI is Chinese with
  text fields throughout.
- Ask before leaving only when there is unsaved editing. Do not switch mode
  while asking: the form holding the draft lives inside the overlay subtree.

## Text

Interface copy is Chinese. Every string goes through the dictionary in
`packages/ui/scrum-ui/src/messages.ts` with both a `zh` and an `en` entry, keyed
by `MessageKey`. No literal copy in components.

Code, types and code comments are English.
