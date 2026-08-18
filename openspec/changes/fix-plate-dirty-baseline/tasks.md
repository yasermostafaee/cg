# Tasks — B-139, the plate dirty baseline

## 1. One canonical "not assigned"

- [x] 1.1 `PLATE_UNASSIGNED` + `plateValue()` in
      `apps/runtime/src/renderer/features/inspector/draftStore.ts`, reconciling the STAGED `''` with
      the APPLIED `null` in one place. Used by `isItemDirty`, `isPlateDirty` and
      `effectivePlateSource`, so the three cannot drift.

## 2. The baseline becomes required

- [x] 2.1 `isItemDirty(itemId, applied, appliedPlates)` — `appliedPlates` REQUIRED, no default.
- [x] 2.2 Deleted the docstring paragraph licensing the omission (it named the stack row as a caller
      that could legitimately omit the map).
- [x] 2.3 Replaced it with a note saying why the parameter is required, that a corrected call site is
      one edit from regressing while a required parameter is a compile error, and that
      `appliedPlateSources` is the canonical join every caller can reach.

## 3. Fix every caller the signature surfaces

- [x] 3.1 `features/layers/LayersPanel.tsx:760` — supplies
      `appliedPlateSources(item.templateId, template?.liveSources?.sources ?? [])`. `template` was
      already in scope.
- [x] 3.2 **Every caller, swept and listed.** Production: exactly TWO — `Inspector.tsx:401` (already
      correct, passes the same canonical join) and the row above. Tests: three field-only call sites
      in `tests/draftStore.test.ts` (`:58`, `:64`, `:175`) now pass an explicit `NO_PLATES` map.
      **No caller lacked a baseline**, so nothing had to be reported as unavailable.
      ⚠ **Finding:** `apps/runtime`'s `typecheck` includes `src/**/*` only, so the compile-error
      guarantee covers production code and NOT tests. The three test call sites did not fail
      typecheck and did not fail at runtime either, because `appliedPlates` is only dereferenced when
      the item has staged plates and those cases stage fields only. They were fixed anyway — a test
      documenting a call shape the API forbids is a licence in another form.

## 4. Tests

- [x] 4.1 A different source ⇒ dirty.
- [x] 4.2 Back to the saved source ⇒ NOT dirty.
- [x] 4.3 _Not assigned_ ⇒ dirty.
- [x] 4.4 Order-independence — every ordered pair of the three transitions asserts the same outcome
      as the second transition alone (four permutations, driven rather than claimed).
- [x] 4.5 **VERIFIED RED BEFORE GREEN.** With the pre-fix collapsed baseline restored
      (`value !== ''`), `tests/livePlateDraft.test.ts` fails **7 of 22**: the false positive, the
      false negative, all four order permutations, and the pre-existing
      "counts toward the ITEM being dirty" case. Restored, all 22 pass.
- [x] 4.6 **ONE DOM test, narrowed on purpose** —
      `apps/runtime/tests/layersPanel.plateDirty.dom.test.ts`.

      **The broader "both surfaces agree" matrix is still NOT built, and that argument stands:** the
      row and the Inspector take the same value from the same call, so asserting they agree would
      assert the framework rather than the rule.

      🔴 **What that argument does NOT cover is the verb, and that is the half that hurt.** A
      predicate returning `true` does not prove a button is enabled. With a plate staged to _not
      assigned_ the row's UPDATE was DISABLED, so the operator could not apply the edit at all —
      and whether a control is enabled is a DOM fact, which this repo's rule says a boundary test
      must read from the browser rather than from the code.

      So the test drives the real `LayersPanel` with a real saved assignment and a real staged
      un-assignment, and asserts two things: the draft chip renders, and the UPDATE menu item is
      enabled. Both assertions are `expect.soft` for the first two facts, because a hard failure on
      the chip would short-circuit before the verb was examined — the red run would then only ever
      prove half of what the test is for.

      **VERIFIED RED ON BOTH HALVES.** Against the pre-fix collapsed baseline:
      `the row should show a draft chip: expected null not to be null` AND
      `UPDATE must be ENABLED ...: expected true to be false`. Green after.

      ⚠ Two instrument notes worth keeping: UPDATE is a `surface: 'menu'` action, so it is not in
      the DOM until the row's context menu is opened, and the menu is PORTALLED to `document.body`;
      and a menu item is a `role="menuitem"` div, so "disabled" is `aria-disabled` — reading
      `.disabled` on it would be `undefined` and would assert nothing.

## 5. Gate

- [x] 5.1 `pnpm openspec validate fix-plate-dirty-baseline --strict` — green.
- [x] 5.2 Full green gate — GREEN: 85/85 tasks, `0 cached, 85 total`, prettier clean, openspec
      54/54.
- [x] 5.3 PRD item `[~]` with this change dir.
- [x] 5.4 This changes what the row renders, so it is classified as owing a Linux `e2e`.
      **Linux `e2e` DISCHARGED** — https://github.com/yasermostafaee/cg/actions/runs/32054398518, commit `56c0799f`, `conclusion: success`, and the **`E2E (Playwright)` job RAN** (`conclusion: success`, not skipped — P-029). Runtime **81 passed**, Designer **267 passed, 1 flaky**.
      `56c0799f` is the batch tip and a descendant of every commit in it, and the `e2e` job is
      whole-tree (`pnpm test:e2e`, no filter), so a green run there verifies the tree that carries
      this change.
      ⚠ The one flaky is `apps/designer/tests/e2e/video-import.spec.ts:291` — "a premultiplied-alpha
      source imports WITHOUT the black fringe (D-128 un-premultiply)" — which failed on its first
      attempt and passed on retry. It is unrelated to this change and is recorded as the SECOND
      occurrence under [[P-034]].
