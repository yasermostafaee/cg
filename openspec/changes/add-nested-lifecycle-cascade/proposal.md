## Why

D-020 gave a composition a runtime lifecycle (intro → hold → outro via a single
`outPoint`) and no-code playout timing, but only for the **top-level** scene: the
runtime built ONE `PlayoutController` and applied every animated element —
including those discovered inside nested composition instances — along the **parent
timeline**. So a nested child could not run its own in→hold→out, hold at its own
out-point, or exit on its own; `play/stop/pause` never reached it as an independent
lifecycle.

Separately, frame rate was stored **per composition** (`Composition.frameRate`),
which lets nested children disagree on fps. A CasparCG channel has ONE fps, and the
cascade's timing is only comparable across children when they share it, so fps must
be a single project-level setting.

## What Changes

- **Nested-lifecycle CASCADE (Option A):** `play/stop/pause/resume/remove` on the
  parent CASCADE recursively to every nested composition instance. The runtime
  builds a PARALLEL **controller tree** over the existing D-025 field-scope tree
  (one `PlayoutController` per instance scope) — it does NOT build a second,
  divergent tree. Each scope runs its OWN lifecycle: its own animated list, its own
  `lifecycle`/`playout`/`activeRange`/`frameRange`, holding at its OWN `outPoint`
  independently. The parent keeps its own controller for its DIRECT elements
  (hybrid). The ROOT scope alone drives the global lifecycle machine + events + the
  session `playoutOverride`; nested children run their own stored `playout` and emit
  nothing globally. Recursion is for arbitrary depth. Children start **with** the
  parent (offset 0) for v1 — real temporal offsets are a separate future feature and
  element `lifespan` (visibility gating) is NOT overloaded for this.
- **Single PROJECT fps (schema):** drop `Composition.frameRate`; fps is the one
  project-level `Scene.frameRate`, shared by every composition and every scope. A
  legacy per-composition `frameRate` is **stripped on load** (Zod), coercing every
  composition to the project fps; keyframe frame-numbers are unchanged. The
  `FrameDriver` already computes frames from elapsed wall-time, so the single fps
  applies identically across every scope. The inspector shows fps **read-only**.
- **State-aware cascade stop (refinement):** a cascaded `stop()` respects each
  scope's CURRENT lifecycle state. An ACTIVE scope (intro / hold / looping —
  including infinite, manual, paused) plays its exit; a scope that already SETTLED
  (auto-out exited, or a finite loop-cycle / content-driven completed its cycles) is
  a NO-OP so its exit is not replayed. The `PlayoutController` tracks a `settled`
  flag (set when its outro finishes, reset by `play()`); `stop()` self-gates on it,
  so the cascade — and the parent's own controller — skip finished scopes.
- **Per-scope preview timing (refinement):** the session-only timing overrides
  (`mode` / `holdMs` / `repeat`) become PER-SCOPE, keyed by the scope's instance-name
  path (`''` = root, `'home'`, `'home.inner'`). The runtime gains
  `scopeOverrides: Record<path, PlayoutOverride>` (the old `playoutOverride` is the
  root alias `''`); each scope's controller merges its own override onto its stored
  playout. The preview groups timing controls by the composition-instance tree
  (parent + each nested instance, by the SAME instance names as the field scopes),
  so a parent can independently test each child's timing — session-only, stored
  defaults untouched. Nested scopes show controls only when their mode is
  timing-relevant.

## Capabilities

### Modified Capabilities

- `designer-playout-lifecycle`: the lifecycle (intro → hold → outro, pause/resume,
  playout timing) now cascades to nested composition instances — each runs its own
  lifecycle on the single shared project fps — instead of being a top-level-only
  machine over one timeline. The cascaded stop is state-aware (finished scopes are
  not re-exited), and the preview's session-only timing overrides are per-scope.

## Impact

- **Schema:** `packages/shared-schema/src/scene.ts` — remove `Composition.frameRate`
  (fps stays only on `Scene.frameRate`); legacy per-comp fps stripped on parse.
- **Runtime:** `packages/template-runtime/src/types.ts` (per-scope `animated` +
  `source: LifecycleSource` on `FieldScope`; drop `BuildSceneResult.nestedAnimated`;
  add `RuntimeBootOptions.scopeOverrides`), `scene-builder.ts` (collect each scope's
  animated; set each scope's lifecycle source), `playout-controller.ts` (track a
  `settled` flag + `isSettled()`; `stop()` no-ops when settled), `runtime.ts` (build
  a controller tree from the scope tree; cascade play/stop/pause/resume/remove;
  per-scope override merge by path; root drives the machine/events; one project fps
  everywhere; flat list for `tick()`).
- **Designer:** `state/store.ts` (`EditDocFields` drops `frameRate`; `editSceneOf`
  projects the project fps; comp literals in `ensureCompositions`/`addComposition`
  drop `frameRate`; `updateScene` routes an fps patch to the scene root),
  `platform/ProjectStore.ts` (new-project comp literal drops `frameRate`),
  `features/inspector/InspectorPanel.tsx` (`FrameRateRow` read-only),
  `features/fields/PreviewTimingControls.tsx` (per-scope `source`/`title` + exported
  `effectiveMode`/`TIMING_RELEVANT_MODES`), `features/fields/PreviewScopeTiming.tsx`
  (NEW — per-scope timing tree + grouped controls), `PreviewModal.tsx` (per-scope
  `overrides` state → `scopeOverrides`), `platform/preview.ts` (plumb
  `scopeOverrides` to `createRuntime`).
- **Starter templates:** `news.ts`, `showcase.ts` — comp literals drop `frameRate`.
- **Tests:** runtime cascade (children hold at own out-point independently; stop
  cascade; pause/resume cascade; parent out-point + cascade; arbitrary depth);
  controller state-aware stop (settled auto-out / finite loop-cycle are no-ops;
  infinite / manual / paused still exit); runtime state-aware cascade (finished child
  not re-exited; infinite-loop child exits) + per-scope override (one child timed,
  sibling + stored defaults untouched); schema (fps only on the scene; legacy comp
  fps stripped); designer (every comp shares the project fps; per-scope timing tree
  grouped by instance).
- **No `schemaVersion` bump** — removing an optional field is backward-compatible
  (legacy values are stripped, not rejected).
