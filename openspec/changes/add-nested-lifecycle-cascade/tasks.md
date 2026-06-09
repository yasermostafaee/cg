## 1. Schema (@cg/shared-schema)

- [x] 1.1 Remove `frameRate` from `CompositionSchema` (fps stays only on
      `Scene.frameRate`); legacy per-comp fps stripped on parse. No `schemaVersion` bump.
- [x] 1.2 Tests — fps lives only on the scene; a legacy per-composition `frameRate`
      is stripped on load (coerced to the project fps).

## 2. Runtime (@cg/template-runtime)

- [x] 2.1 `types.ts` — extend `FieldScope` with per-scope `animated` +
      `source: LifecycleSource`; drop `BuildSceneResult.nestedAnimated`.
- [x] 2.2 `scene-builder.ts` — collect each scope's animated elements (all depths)
      into `scope.animated`; set each scope's `source` (scene for root, comp for child).
- [x] 2.3 `runtime.ts` — build a controller tree over the scope tree (one controller
      per scope, all on `scene.frameRate`); cascade play/stop/pause/resume/remove; root
      drives the machine/events + effective (overridable) playout, children use their own
      stored playout and emit nothing globally; flat animated union for `tick()`.
- [x] 2.4 Tests — (a) parent play → each child holds at its own out-point
      independently; (b) parent stop → each child's own outro; (c) parent pause/resume
      cascades; (d) parent out-point applies to direct elements AND cascades; (e)
      arbitrary depth (parent → child → grandchild).

## 3. Designer (@cg/designer)

- [x] 3.1 `state/store.ts` — `EditDocFields` drops `frameRate`; `editSceneOf`
      projects the project fps; comp literals (`ensureCompositions`/`addComposition`)
      drop `frameRate`; `updateScene` routes an fps patch to the scene root.
- [x] 3.2 `platform/ProjectStore.ts` — new-project comp literal drops `frameRate`.
- [x] 3.3 `features/inspector/InspectorPanel.tsx` — `FrameRateRow` read-only.
- [x] 3.4 Tests — every composition is projected with the single project fps; a new
      composition introduces no fps of its own.

## 4. Starter templates (@cg/starter-templates)

- [x] 4.1 `news.ts`, `showcase.ts` — composition literals drop `frameRate` (scene
      fps retained).

## 5. State-aware cascade stop (refinement)

- [x] 5.1 `playout-controller.ts` — track a `settled` flag (set when the outro
      finishes / a finite loop completes, reset by `play()`); `stop()` no-ops when
      settled; add `isSettled()`.
- [x] 5.2 Tests — controller: stop on a settled auto-out / completed finite
      loop-cycle is a no-op; stop still exits infinite-loop / manual / paused.
- [x] 5.3 Tests — runtime: a finished child is NOT re-exited on parent stop; an
      active infinite-loop child IS exited.

## 6. Per-scope preview timing (refinement)

- [x] 6.1 `types.ts` — add `RuntimeBootOptions.scopeOverrides` (path → override);
      `runtime.ts` merges each scope's override onto its stored playout by path
      (`''` = root; `playoutOverride` is the root alias).
- [x] 6.2 `PreviewTimingControls.tsx` — accept a narrowed `source` + `title`; export
      `effectiveMode` / `TIMING_RELEVANT_MODES`. `PreviewScopeTiming.tsx` (NEW) —
      build the per-scope timing tree (`timingScopeList`) and render grouped
      controls (root always; nested only when timing-relevant). `PreviewModal.tsx` —
      per-scope `overrides` state, posts `scopeOverrides`. `platform/preview.ts` —
      plumb `scopeOverrides` into `createRuntime`.
- [x] 6.3 Tests — runtime: a per-scope override times one child, leaving its sibling
      and the stored template unchanged (session-only). Designer: `timingScopeList`
      groups by parent + each nested instance (distinct paths; deeper dotted paths);
      timing-relevance gating.

## 7. Gate

- [x] 7.1 Green gate: typecheck + lint + test + build for `@cg/shared-schema`,
      `@cg/template-runtime`, `@cg/starter-templates`, `@cg/designer`.
- [x] 7.2 `pnpm openspec validate add-nested-lifecycle-cascade --strict`.
