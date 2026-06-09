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

## Capabilities

### Modified Capabilities

- `designer-playout-lifecycle`: the lifecycle (intro → hold → outro, pause/resume,
  playout timing) now cascades to nested composition instances — each runs its own
  lifecycle on the single shared project fps — instead of being a top-level-only
  machine over one timeline.

## Impact

- **Schema:** `packages/shared-schema/src/scene.ts` — remove `Composition.frameRate`
  (fps stays only on `Scene.frameRate`); legacy per-comp fps stripped on parse.
- **Runtime:** `packages/template-runtime/src/types.ts` (per-scope `animated` +
  `source: LifecycleSource` on `FieldScope`; drop `BuildSceneResult.nestedAnimated`),
  `scene-builder.ts` (collect each scope's animated; set each scope's lifecycle
  source), `runtime.ts` (build a controller tree from the scope tree; cascade
  play/stop/pause/resume/remove; root drives the machine/events + effective playout,
  children use their own stored playout; one project fps everywhere; flat list for
  `tick()`).
- **Designer:** `state/store.ts` (`EditDocFields` drops `frameRate`; `editSceneOf`
  projects the project fps; comp literals in `ensureCompositions`/`addComposition`
  drop `frameRate`; `updateScene` routes an fps patch to the scene root),
  `platform/ProjectStore.ts` (new-project comp literal drops `frameRate`),
  `features/inspector/InspectorPanel.tsx` (`FrameRateRow` read-only).
- **Starter templates:** `news.ts`, `showcase.ts` — comp literals drop `frameRate`.
- **Tests:** runtime cascade (children hold at own out-point independently; stop
  cascade; pause/resume cascade; parent out-point + cascade; arbitrary depth);
  schema (fps only on the scene; legacy comp fps stripped); designer (every comp
  shares the project fps; a new comp introduces no fps of its own).
- **No `schemaVersion` bump** — removing an optional field is backward-compatible
  (legacy values are stripped, not rejected).
