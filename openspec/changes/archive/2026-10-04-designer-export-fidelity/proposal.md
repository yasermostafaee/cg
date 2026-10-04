# The canvas backdrop is an EDITOR fact, and can no longer reach air (B-129)

## Why

The canvas backdrop an author sets while editing is carried into the render, so a lower-third
can go to air as a full-frame card, covering the video behind it. Nothing in the Designer says
it will happen — the editor looks the same either way.

**Mechanism, now diagnosed** (the item recorded `MECHANISM NOT DIAGNOSED`):

- `BackgroundControl.tsx` is an _"always-on scene background picker"_ that writes
  `scene.background` (`designerStore.updateScene({ background })`).
- `scene-builder.ts:98-100` applies `scene.background` to `.cg-stage` in **every** render mode,
  `output` included. `scene-builder.ts:278`, `:900`, `:1041` do the same for a nested
  composition's `comp.background`.

So one field carries two different facts — _"let me see my white text while I work"_ and _"this
graphic paints a background on air"_ — and the render path cannot tell them apart.

## What Changes

**The decision: `background` MEANS the editor's backdrop, and nothing else.** An authored
background is expressed the way every other painted thing is — a real full-frame element, with a
real entry in the scene. The field is therefore RENAMED to `editorBackdrop`, because a name that
does not state its contract is how this defect happened (golden rule 6).

- **`@cg/shared-schema`** — `Scene.background` / `Composition.background` become
  `editorBackdrop`. A legacy `background` key is moved to `editorBackdrop` **at parse time**
  (`z.preprocess`), so every stored scene loads unchanged and the parsed type carries no
  `background` field at all. **The wrong state is unrepresentable after parse** — not two values
  kept in sync.
- **`@cg/template-runtime`** — `editorBackdrop` paints ONLY when `mode === 'author'`. In
  `output` mode the stage and every composition inner are transparent unless a real element
  paints them. `RenderMode` already exists and is already threaded to every builder; this uses
  the seam rather than adding one.
- **Both exporters** — the emitted scene carries `editorBackdrop: 'transparent'`, so the
  artifact cannot carry the value even if a future renderer forgot the mode check. Defence in
  depth, not the guard.
- **Designer** — the control writes `editorBackdrop` and SAYS what it is: an editor-only
  backdrop that does not reach air.

### 🔴 Why NOT a schema-version bump and a registry migration

The item's fix shape assumes one. It cannot be done that way today, and this is a finding worth
recording: **`migrate()` has ZERO production call sites.** Its own docstring claims _"The loader
in `@cg/vcg-format` walks the registry from the loaded version to current"_ — that is false.
Nothing outside `@cg/shared-schema` and its own tests imports `migrations`; `schemaVersion: 1` is
WRITTEN by `ProjectStore.ts:72` and `pack.ts:87` and never read for migration. Registering a
migration would create the appearance of a conversion that never runs.

Parse-time normalization is the codebase's own precedent for exactly this
(`PlayoutSchema`'s `z.preprocess`, whose comment says _"A registry migration is deferred until a
schema-version bump is unavoidable"_), it runs on every load path automatically, and it needs no
version bump because the value is preserved rather than reinterpreted.

### What happens to templates that already carry a background

**Their editing appearance is unchanged; their ON-AIR appearance changes, and that is the fix.**
A legacy `background` becomes `editorBackdrop`, so the Designer looks identical. On air it stops
painting — which is the defect being removed. It is **announced, not silent**: the control now
states that the backdrop is editor-only, and the remedy is the second acceptance bullet —
place a full-frame rectangle, which is a real element and still renders unchanged.

## Impact

- Affected specs: `designer-canvas-viewport` (ADDED — the backdrop's meaning)
- Affected code: `packages/shared-schema/src/scene.ts`,
  `packages/template-runtime/src/scene-builder.ts`,
  `packages/single-file-export/src/exporter-single-file.ts`, `packages/vcg-format/src/pack.ts`,
  `apps/designer/src/renderer/features/canvas/BackgroundControl.tsx`
- **Alters what renders ⇒ a Linux `e2e` debt is owed** and is discharged only by a COMPLETED,
  GREEN `e2e` job on a commit carrying this change.
