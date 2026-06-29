# Tasks — designate the main / entry composition (D-115)

## 1. Schema + store

- [x] `scene.ts` — optional `entryCompositionId: IdSchema.optional()` (non-breaking; absent ⇒ first).
- [x] `composition.ts` — `setEntryComposition(id | null)` (validates the id, null clears);
      `deleteComposition` clears `entryCompositionId` when the deleted comp was the designation.
- [x] `scene-doc.ts` `ensureCompositions` — resolve the entry comp (set + valid) else the first.

## 2. UI

- [x] `CompositionsPanel.tsx` — "Set as main" / "Unset main" context action + a "main" badge on the
      designated row (`CompositionsPanel.css.ts`).

## 3. Tests

- [x] Unit (`entry-composition.test.ts`): `setEntryComposition` persists/clears + unknown-id no-op;
      delete-clears (main) / leaves-intact (other); `ensureCompositions` resolves entry / falls back /
      stale; `SceneSchema` round-trip.
- [ ] E2E (`entry-composition.spec.ts`): Set as main marks the row + toggles to Unset; deleting the
      main clears the designation.

## 4. Gate

- [ ] `format:check` + `typecheck` + `lint` + `test` + `build` for `@cg/shared-schema` +
      `@cg/designer` (turbo `--force`).
- [ ] `pnpm test:e2e` (the new spec).
- [ ] `pnpm openspec validate designate-entry-composition --strict`.
- [ ] Conventional commit; D-115 PRD `[~]`. Do NOT archive.
