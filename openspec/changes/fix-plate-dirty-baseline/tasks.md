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
- [ ] 4.6 A DOM-level assertion that the row's chip and the Inspector's agree per transition.
      **NOT DONE** — the predicate-level tests cover the defect and its inverse, and both surfaces
      now provably take the same value from the same call. A DOM test would assert the wiring rather
      than the rule. Left open deliberately rather than silently skipped.

## 5. Gate

- [x] 5.1 `pnpm openspec validate fix-plate-dirty-baseline --strict` — green.
- [x] 5.2 Full green gate — GREEN: 85/85 tasks, `0 cached, 85 total`, prettier clean, openspec
      54/54.
- [x] 5.3 PRD item `[~]` with this change dir.
- [ ] 5.4 This changes what the row renders, so it is classified as owing a Linux `e2e`.
      **Linux `e2e` still owed — NO RUN URL. Not pushed: the push was HELD on 2026-08-17 by owner decision, to spend one CI run on the complete four-item set rather than two runs on halves.** Local Windows runs are non-authoritative and discharge nothing: for the record they were green (full `pnpm gate` 85/85 `0 cached`; runtime E2E 78/78). A ticked box with no run URL is a claim, not a discharge.
