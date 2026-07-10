# Tasks — add-anchor-context-menu (D-123)

## 1. Recon / design

- [x] Trigger surface confirmed: anchor `<rect data-cg-anchor>` squares only (handles/segments
      untouched); menu anchors at the pointer's viewport coords (the `screen()` mapping is not
      involved in placement).
- [x] Native-menu suppression verified: App.tsx already suppresses app-wide; anchor handler +
      backdrop still preventDefault locally (defense in depth); right-click elsewhere unchanged.
- [x] Pen conflict ruled out by construction (PathEditor mounts only with the cursor tool since
      B-037; pen-armed right-click out of scope).
- [x] Menu primitive survey: no shared component exists (timeline/panel menus are bespoke,
      mouse-only) → minimal `AnchorContextMenu` in the canvas feature, pattern-matched to
      `LayerContextMenu` + full keyboard support; items via the shared `Control`.
- [x] D-123 verified as the next free D number.

## 2. Spec

- [x] OpenSpec MODIFIED on `designer-path-element` ("A selected path is fully editable" gains the
      right-click menu with keyboard-delete semantics, accessibility, and Esc-owned dismissal);
      `pnpm openspec validate add-anchor-context-menu --strict` before implementing.

## 3. Implementation

- [x] `AnchorContextMenu.tsx` (+ `.css.ts`): fixed backdrop + clamped `role="menu"`;
      `role="menuitem"` `Control` items from an `items` array; focus-first-on-open;
      ArrowUp/Down wrap; Enter/Space activate; Esc closes via capture-phase window listener
      (preventDefault + stopImmediatePropagation — B-037 Esc ownership); wheel closes;
      outside-click closes; backdrop suppresses contextmenu.
- [x] `PathEditor.tsx`: anchor rect `onContextMenu` → setActive + open the menu at the pointer
      with **Delete point** → the EXISTING `removeAnchor(id)` (no changes to the deletion /
      re-stitch / below-2 / history-boundary logic); `dragAnchor` ignores non-primary buttons;
      menu rendered as an svg sibling (fragment).

## 4. Tests

- [x] Unit `apps/designer/tests/anchor-context-menu.test.ts` (the house `createRoot`+`act`
      component-test pattern — the app has no RTL dependency, and vitest only picks up `.test.ts`):
      right-click an anchor → menu renders (role/label) and focus moves in; Delete point removes
      exactly that anchor from the store (re-stitch); the below-2-anchors branch deletes the
      element; Esc closes without acting, proven OWNED via a bubble-phase spy that must never
      fire; wheel dismisses; Arrow focus cycling.
- [x] E2E `apps/designer/tests/e2e/anchor-context-menu.spec.ts`: cursor tool on a finished path →
      right-click an anchor → menu appears; Delete point removes that anchor (anchor count + d);
      one undo restores; deleting to below 2 anchors removes the element; Esc closes the menu with
      selection + tool intact.

## 5. Docs

- [x] PRD `docs/prd/designer.md`: D-123 filed (`[~]`, branch + change dir, owner decision
      2026-07-08 noted); ROADMAP line added.
- [x] Engine doc-sync: canvas README path-editing section (right-click menu entry point).

## 6. Gate + ship

- [x] Uncached gate (`pnpm turbo run typecheck lint test build --force`, 15/15 + root
      `pnpm format:check` green); `pnpm test:e2e` (193 passed); `pnpm openspec validate --all
--strict` (34/34).
- [x] Preview served; PAUSED with no commit/push. Owner CONFIRMED ship-as-is 2026-07-10 (the
      Delete-point behavior verified; one styling note — align the menu chrome with the app's
      other context menus — deliberately deferred to the follow-up pen edit-mode change, Item 1
      of the owner's next brief, rather than blocking this merge).
- [ ] Conventional commit(s), push, verify the remote head, give the compare URL. `[x]`/archive
      after owner confirm + merge.
