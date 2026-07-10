# Right-click anchor context menu — Delete point (D-123)

## Why

Deleting a path anchor currently requires knowing the keyboard path (activate the anchor, press
Delete/Backspace). The owner wants direct pointer access (decision 2026-07-08): a small MENU on
right-click — chosen over a bare direct-delete so it can grow (Convert to corner/smooth, …) later —
on FINISHED paths only (cursor tool), first item **Delete point**.

## What Changes

- Right-clicking an anchor square in the `PathEditor` overlay (cursor tool, path selected) opens a
  small context menu at the pointer with **Delete point**, which calls the EXISTING
  `removeAnchor(id)` — the deletion/re-stitch/below-2-anchors-deletes-the-element/history-boundary
  logic is reused verbatim, not duplicated.
- The trigger surface is the anchor squares ONLY (not handle dots, not segments). The browser's
  native menu never shows (App.tsx already suppresses it app-wide; the anchor handler additionally
  prevents + stops propagation). Right-click elsewhere on the canvas is untouched; right-click
  while the PEN tool is armed is out of scope (the overlay isn't even mounted then, per B-037).
- The menu is accessible and keyboard-complete: `role="menu"`/`menuitem`, focus moves to the first
  item on open, ArrowUp/Down cycle, Enter activates, Esc closes — and the menu OWNS its Esc
  (capture-phase, stopped) so closing never falls through to the canvas deselect/tool handling
  (the B-037 Esc-ownership pattern). Dismissal: outside click, Esc, scroll/wheel, or selecting an
  item.
- No shared menu primitive exists in the app (the timeline's `LayerContextMenu` is bespoke to that
  feature and mouse-only) — a minimal `AnchorContextMenu` is built in the canvas feature following
  that component's established pattern (fixed backdrop + clamped fixed menu), with the keyboard
  support the spec requires, items rendered through the shared `Control` primitive. Items are an
  array, so future entries (Convert to corner/smooth) are one line each — but only Delete point
  ships now (no disabled placeholders).

## Capabilities

- **`designer-path-element`** (MODIFIED): "A selected path is fully editable" gains the
  right-click anchor menu (Delete point with keyboard-delete semantics; accessible menu; clean
  dismissal with Esc ownership).

## Impact

- NEW `apps/designer/src/renderer/features/canvas/AnchorContextMenu.tsx` (+ `.css.ts`).
- `apps/designer/src/renderer/features/canvas/PathEditor.tsx` — right-click wiring on the anchor
  rects (menu state; `dragAnchor` now ignores non-primary buttons); no change to
  `removeAnchor`/stitch/normalize logic.
- Tests: NEW unit `apps/designer/tests/anchor-context-menu.test.ts` (house `createRoot`+`act`
  component pattern; menu→removeAnchor wiring, below-2-anchors branch, Esc ownership, wheel
  dismissal, Arrow focus); NEW E2E `apps/designer/tests/e2e/anchor-context-menu.spec.ts`.
- Docs: PRD `docs/prd/designer.md` D-123 (`[~]`); ROADMAP line; canvas README path-editing section
  (engine doc-sync).
