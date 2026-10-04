# Tasks — the compatibility floor (P-031)

## 1. Delete the dead migration registry

- [x] 1.1 Remove `packages/shared-schema/src/migrations/` and its `export * as migrations` from
      `src/index.ts`.
- [x] 1.2 Remove `packages/shared-schema/tests/migrations.test.ts` — it tested dead code, and it
      is the only thing that ever called `migrate()`.
- [x] 1.3 Re-point `zones.test.ts`'s "the registry is still empty" assertion. It becomes the
      assertion that MATTERS now: `schemaVersion` is still a literal, so a stale document FAILS.
- [x] 1.4 ⚠ `SceneSchema.schemaVersion` stays `z.literal(1)` — verify by test, not by reading.

## 2. Remove the legacy compatibility shims

- [x] 2.1 `@cg/vcg-format` — `readProjectDocument` refuses non-zip bytes with a readable message;
      `ProjectDocumentForm`, `ProjectDocument.form` and the nullable `manifest` are gone.
- [x] 2.2 `@cg/designer` — `adoptDocument` has one arm; `AssetStore.collectLegacyAssets` and the
      `convertedProjects` forced-Save-As rule are removed (re-judged, see the proposal).
- [x] 2.3 `@cg/shared-schema` — the `background` → `editorBackdrop` `z.preprocess` is removed from
      `SceneSchema` and `CompositionSchema`; the `z.preprocess` MECHANISM stays.
- [x] 2.4 `PlayoutSchema`'s legacy `mode` key is deliberately LEFT and flagged in `P-031` as the
      one remaining shim and the owner's call — it was not in the enumerated list.

## 3. Tests and fixtures

- [x] 3.1 Replace the three B-129 shim tests in `scene.test.ts` with two that assert the loud
      failure and the stripped stale key; the replaced tests are named in place.
- [x] 3.2 Re-point the two `@cg/vcg-format` legacy tests to assert the refusal.
- [x] 3.3 Re-point the Designer's legacy control test; remove the two conversion tests with a
      note naming them.
- [x] 3.4 `fixtures/b034/*.scene.json` + `.gen.mjs` carry `editorBackdrop`; the `.vcg` fixtures
      were regenerated from the `.gen.mjs`.

## 4. Record the policy

- [x] 4.1 `P-031` carries the DECISION, the removal table, what was deliberately left, the
      re-judgment of the Save-As rule, and 🔴 **the policy AND its reversal**.
- [x] 4.2 Amend the still-active `designer-project-package` (D-150) change — its spec and tasks
      mandated the conversion path this decision retires. No contradictory text is left behind.

## 5. Gate

- [x] 5.1 `format:check` + `typecheck` + `lint` + `test` + `build` for every touched workspace.
- [x] 5.2 No E2E is owed: nothing user-facing renders differently. The Designer's own
      `project-package.spec.ts` still covers the save/reopen round trip through the one form.
