# Tasks

## Phase A — export-scoping engine (this change)

- [x] 1. Add `collectChildCompositionRefs` (composition + repeater, recursing containers),
     `directCompositionRefs`, and `compositionClosure(scene, rootId)` to
     `@cg/shared-schema` (`composition-fields.ts`); export via the barrel.
- [x] 2. Repoint the author-time cycle guard (`canNestComposition` in
     `state/slices/composition.ts`) at the shared `compositionClosure`; remove the local
     `collectCompRefs` / `directRefsOf` (composition-only) walkers.
- [x] 3. Add `scopeSceneToComposition(scene, rootId)` to `state/scene-doc.ts` (editSceneOf
     projection + `compositions` filtered to the closure); re-export from `state/store.ts`.
- [x] 4. Route `.vcg` (`exportVcg` → `runDisk`) and HTML (`exportHtml` → `runSingleFileHtml`)
     through `scopeSceneToComposition`; reuse it for Preview for parity. Bridge/channel +
     `@cg/vcg-format` packager unchanged.
- [x] 5. Unit-pin `compositionClosure`: a root nesting a `composition` AND a `repeater` →
     BOTH child comps in the closure (transitively, recursing containers); a sibling
     unreachable from the root is excluded; terminates on a malformed cycle.
- [x] 6. Per-comp export tests: an image living ONLY in a sibling comp is NOT packaged
     (`.vcg`) / inlined (HTML); an image in a nested child (composition OR repeater) IS;
     the scoped scene lifts the root's layers to the play-entry.
- [x] 7. Cycle-guard test: a repeater-mediated cycle is blocked at author time; the classic
     composition-instance cycle is still blocked; a safe nesting is allowed (no regression).
- [x] 8. Preflight-scoped test: a validation error in a sibling comp does NOT block the
     root's export.
- [x] 9. Green gate (uncached) for `@cg/shared-schema` + `@cg/designer`; existing
     export/composition tests still pass; `openspec validate per-composition-export-and-chrome
--strict`.

## Phase B — top-chrome relocation

- [x] 10. Slim the global `TopToolbar`: menus + centered project name (`scene.name`) + Save
      (D-089 amber preserved); remove Preview / Export .vcg / Export HTML.
- [x] 11. New per-composition action bar (`CompositionActionBar`) pinned at the FOOT of the
      LEFT RAIL (off the canvas, so the editing surface keeps full height) carrying Preview /
      Export .vcg / Export HTML — compact buttons that share the rail width. (Playout-target
      SELECTOR deferred — owner pick: a one-option dropdown is dead-weight; the persisted
      field below is the seam, the visible combo lands with a 2nd target / C-001.)
- [x] 12. Add an optional per-composition `playoutTarget` to the `Composition` schema
      (sibling to `playout`); persisted + backward-compatible (absent ⇒ `casparcg`). No
      visible combo yet (see task 11).
- [x] 13. Remove the project-level export path entirely (File→Export item + the global-bar
      Export/HTML/Preview buttons; the only export/preview triggers are now the per-comp bar).
- [x] 14. E2E: `top-chrome.spec.ts` (global bar has the centered name + Save, no Preview /
      Export / HTML, no File→Export; per-comp bar renders + exports the active comp). Existing
      preview/export specs now exercise the per-comp bar via the updated page objects.
- [x] 15. Engine doc-sync: note the per-composition action bar in the canvas engine README.
