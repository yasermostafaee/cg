# Tasks — the canvas backdrop is an EDITOR fact (B-129)

## 1. Schema — the name states the contract

- [x] 1.1 `packages/shared-schema/src/scene.ts`: rename `background` → `editorBackdrop` on BOTH
      `SceneSchema` and `CompositionSchema`, same value shape
      (`'transparent' | HexColorSchema`). Document on the field that it is an EDITOR affordance
      and is never rendered to output — the name is the contract (golden rule 6).
- [x] 1.2 🔴 **Parse-time normalization, not a registry migration.** A legacy `background` key
      is moved onto `editorBackdrop` by a `z.preprocess` on both schemas, so every stored scene
      loads unchanged and the parsed type carries NO `background` field. Record WHY on the
      preprocess: `migrate()` has zero production call sites (verified — nothing outside
      `@cg/shared-schema` imports `migrations`; `schemaVersion: 1` is written by
      `ProjectStore.ts` and `pack.ts` and never read), so a registered migration would be a
      conversion that never runs. Follows `PlayoutSchema`'s own precedent.
- [x] 1.3 The preprocess must not clobber an explicit `editorBackdrop` when both keys are
      present — the new spelling wins, so a re-save cannot be undone by a stale key.

## 2. Render — the mode seam that already exists

- [x] 2.1 `packages/template-runtime/src/scene-builder.ts`: the scene root paints
      `editorBackdrop` ONLY when `mode === 'author'` (`buildScene`, ~:98).
- [x] 2.2 The same for every nested composition inner (~:278, ~:900, ~:1041) — all three sites,
      because a composition instance is where a nested backdrop would otherwise leak.
- [x] 2.3 `RenderMode` is already threaded to each of those builders; use the existing seam and
      do NOT add a second one.

## 3. Export — defence in depth

- [x] 3.1 Both exporters emit `editorBackdrop: 'transparent'`, so the artifact cannot carry the
      value even if a renderer forgot the mode check. Record that this is defence in depth and
      that the mode check in §2 is the guard.

## 4. Designer — say what it is

- [x] 4.1 `BackgroundControl.tsx` writes `editorBackdrop`; its label, `title` and `aria-label`
      state that it is an editor backdrop that does NOT reach air.

## 5. Tests

- [x] 5.1 Schema: legacy `background` normalizes onto `editorBackdrop`; the parsed object has no
      `background`; an explicit `editorBackdrop` wins when both are present; round-trip.
- [x] 5.2 Render: `output` paints no background for scene root AND nested composition, for a
      non-transparent backdrop; `author` paints it. A full-frame rect element still renders in
      `output` — the "author wanted a background" case.
- [x] 5.3 Export: `.vcg` pack and single-file export both emit a transparent backdrop from a
      scene that carried a colour.
- [x] 5.4 Designer E2E (`apps/designer/tests/e2e/editor-backdrop.spec.ts`) — **NARROWED, and the
      narrowing is recorded in the spec file rather than hidden.** It asserts the "author is
      told" scenario only. TWO findings forced that:
      **(a)** There is no "the authoring canvas shows it" assertion to make: the D-071 pasteboard
      pins `.cg-stage { background-color: #3d4253 !important }` plus the checkerboard
      (`preview.ts`), and `!important` beats the runtime's inline style — so the author NEVER saw
      their backdrop on canvas while air did. That is the sharpest possible form of the item's
      own _"the editor looks the same either way"_, and it makes this fix a pure removal of harm.
      **(b)** The `<input type="color">` could not be driven from Playwright — `fill()` is
      swallowed by React's value tracker, and the native-setter + `input`/`change` route still
      left the input reading `#000000`. Rather than escalate the simulation until something
      moved, the export round-trip is asserted where it can be asserted completely: both
      exporters' own suites.
      🔴 **Not covered end-to-end: a colour set through the REAL control reaching a REAL exported
      file.** Named so a green suite is not mistaken for that guarantee. Closing it wants a hex
      TEXT input on the control (the repo's other colour specs drive those and they work) — a
      real usability gain, deliberately not bundled into an on-air fix.

## 6. Gate

- [x] 6.1 `pnpm openspec validate designer-export-fidelity --strict`.
- [x] 6.2 Full green gate (`pnpm gate`, uncached).
- [x] 6.3 `pnpm test:e2e` green locally — designer **253 passed**, runtime **67 passed**. One
      designer spec failed on the first turbo-run and passed on an isolated re-run of the whole
      suite: the B-098/B-073 contention class, not this change.
- [ ] 6.4 🔴 **A Linux `gate:e2e` IS OWED** — this alters what renders. Discharged ONLY by a
      COMPLETED, GREEN `e2e` job on GitHub Actions for a commit carrying this change. **Write
      the run URL in beside this box** — a ticked box with no URL is not a discharge.

## 7. Engine doc-sync

- [x] 7.1 `packages/template-runtime/README.md`: record that the backdrop is author-mode-only,
      beside the existing `RenderMode` material.
