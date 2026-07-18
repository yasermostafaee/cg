# Tasks — right-click a stack row for its actions (R-013)

## 1. Recon (done)

- [x] 1.1 The WIP branch `feat/runtime-context-menu` (d3a077e) had already MERGED as #326
      (`0e9e7a5`): `ui/ContextMenu.tsx`, `ui/useContextMenu.ts` and the App-wide suppressor are
      on main. The rebase correctly dropped the commit as already-applied. Nothing stale to
      resolve — but the primitive is wired to NOTHING, which is the actual gap.
- [x] 1.2 Re-derived every gate from the CURRENT button code, not from what the WIP assumed:
      PLAY `onAir || linkDown`; UPDATE `!onAir || linkDown`; CLEAR `!isOnAir(item) || linkDown`
      (a DIFFERENT predicate from `onAir` — deliberately); REMOVE `linkDown` (B-085). Library:
      Load and Remove are both ungated (B-085 made the library browser-local).
- [x] 1.3 Refusal routing is per-action: PLAY/CLEAR/REMOVE → `reportCommandError`; UPDATE → a
      no-op, because `applyDraft` already toasts with its own B-070 wording and a second report
      would double-toast.

## 2. Shared action declaration

- [x] 2.1 `ui/rowAction.ts`: a `RowAction` (key, label, variant, disabled, title, run, onError)
      declared once and rendered twice; `toMenuItems` projects it; `runRowAction` executes it.
- [x] 2.2 Extract `asyncResultMessage` / `asyncRejectionMessage` from `AsyncButtonController`
      and use them in BOTH, so a refusal reads identically however it was issued.

## 3. Wiring

- [x] 3.1 `StackRow`: build the four actions once, render `AsyncButton`s from the list, and
      pass the SAME list to the menu. Right-click opens it and does NOT select the row.
- [x] 3.2 `LibraryPanel`: right-click a template row → Load / Remove, calling `loadOntoStack` /
      `removeTemplate` (Remove keeps its confirm gate — the gate is inside the handler).
      Completes [[R-005]] task 5.2.

## 4. Primitive gaps found while wiring

- [x] 4.1 Dismiss on SCROLL (and resize): the menu is positioned in viewport coordinates
      against its row, so a scroll would leave it pointing at whatever slid into place.
- [x] 4.2 Memoize the enabled-index set — it is a keydown-effect dependency, so a fresh array
      each render tore down and re-added the listener every render.
- [x] 4.3 App-wide suppressor exempts text entry (inputs / textarea / contenteditable), so
      Persian copy keeps cut/copy/paste and the BiDi services.

## 5. Tests

- [x] 5.1 The mirror invariant, asserted by COMPARING the two surfaces across every status ×
      link (not by restating the expected gates — a restatement passes if both drift together).
- [x] 5.2 DISCONNECTED: every on-air verb disabled in the MENU too (R-006, no second door).
- [x] 5.3 A menu item runs the row's own handler (spy on the prop, asserting it is not a
      duplicate path); a disabled item does nothing.
- [x] 5.4 A refusal from a menu action surfaces as a TOAST with the bridge's reason, and
      nothing is pinned inline in the row.
- [x] 5.5 Dismissal: Escape, outside click, scroll, and after running an action.
- [x] 5.6 The suppressor exempts text entry and still covers the operator surface.
- [x] 5.7 E2E (geometry — a portalled, viewport-clamped menu is not a jsdom question): the
      menu opens and acts on a real stack row and library row, dismisses, stays fully
      on-screen when opened at a row's bottom-right corner, and the native menu is suppressed
      on the surface but KEPT in a text field.

## 6. Gate

- [x] 6.1 `pnpm gate` green (uncached), caspar-bridge green isolated AND under full parallel test.
- [x] 6.2 `pnpm gate:e2e` green with no dev server / mock / bridge competing for CPU.
- [x] 6.3 `pnpm openspec validate runtime-stack-row-context-menu --strict`.
