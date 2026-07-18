# Right-click a stack row for its actions (R-013)

## Why

The in-app-menu work shipped in two halves and stalled between them. #325 replaced every
browser `confirm`/`prompt` with an in-app modal. #326 landed the context-menu **primitive** —
`ui/ContextMenu`, `useContextMenu`, and app-wide suppression of the browser's native menu —
but wired it to **nothing**.

So the current state is worse than before either landed: right-click across the whole operator
surface now does nothing at all. The native menu is suppressed (correctly — its entries are
Reload and Back, which leave a running show) and no menu replaces it.

The stack row is where that costs most. Its four actions are what an operator reaches for under
time pressure, and they are small targets in a dense row.

## What Changes

- **Right-click a stack row opens that row's four actions** — PLAY, UPDATE, CLEAR, REMOVE.
- **The menu mirrors the buttons structurally, not by agreement.** The row declares its actions
  ONCE (`ui/rowAction.ts`: label, variant, `disabled`, tooltip, handler, failure sink) and
  renders that list twice — as `AsyncButton`s and as menu items. "A menu item is enabled exactly
  when its button is, and runs exactly what its button runs" is therefore true by construction,
  not a property two code paths have to keep in sync.
- **Refusals reach the operator identically.** `asyncResultMessage` / `asyncRejectionMessage`
  are extracted from `AsyncButtonController` and shared, so the same refusal produces the same
  words whichever way it was issued — and it goes to the command TOAST, never inline.
- **The Library's half of the same work** (Load / Remove on a template row) lands with it,
  completing [[R-005]] task 5.2, whose only blocker was the missing primitive.
- **Text entry keeps the browser's menu.** The app-wide suppressor now exempts inputs,
  textareas and `contenteditable` hosts: the Inspector is where Persian copy is typed, and
  cut/copy/paste plus the BiDi/spelling services are real editing affordances. The suppression
  covers the operator SURFACE, not text entry.
- **Dismissal is complete.** Outside-click, Escape, running an action — and now **scroll**,
  which the primitive lacked. The menu is positioned in viewport coordinates against the row it
  was opened on, so a scroll slides that row out from under it; closing beats pointing at
  whatever moved into its place.

## Frozen — this adds no capability

The menu is an ALTERNATE ENTRY POINT to actions that already exist. No new command path, no new
gate, no new state:

- **On-air refusal (R-006) unchanged**, and the menu carries the same link-down gates — a menu
  that let the operator issue PLAY/UPDATE/CLEAR while the bridge is down would be a second,
  UNGUARDED door onto air.
- **[[B-085]]'s browser-local library unchanged** — including REMOVE staying link-gated on the
  stack (bridge-owned state) while the library's Remove is not (browser-local).
- **[[B-086]]/[[B-087]]'s `unverified` badge and [[B-092]]'s stack restore are untouched.**

## Impact

- **Affected specs:** `runtime-ui` (ADDED: right-click opens a row's own actions).
- **Affected code:** `apps/runtime` only — new `renderer/ui/rowAction.ts`; `StackRow` and
  `LibraryPanel` wiring; `ui/ContextMenu.tsx` (scroll dismissal, memoized keyboard set);
  `ui/asyncButtonController.ts` (message mapping extracted for reuse); `renderer/App.tsx`
  (editable-field exemption). No package, bridge, schema or wire change.
