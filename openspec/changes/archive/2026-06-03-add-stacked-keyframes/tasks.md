## 1. Schema

- [x] 1.1 Add optional stable `id` to `KeyframeSchema` (runtime ignores it;
      optional for backward compatibility)

## 2. Store

- [x] 2.1 `freshKeyframeId()` + `normalizeKeyframeIds(scene)` (guards a missing
      `layers`); apply in `setScene`
- [x] 2.2 `upsertKeyframe` stamps a fresh id on each created keyframe
- [x] 2.3 `moveKeyframeById(elementId, property, keyframeId, toFrame)` — moves one
      point without displacing the destination (stacking); stable sort; frame-based
      selection follows the dragged point

## 3. Timeline UI

- [x] 3.1 `TrackRow` diamonds keyed by keyframe id (fixes the React key collision)
- [x] 3.2 Drag uses `moveKeyframeById` (falls back to frame-based for an id-less
      legacy point)
- [x] 3.3 Fan same-frame points vertically so each is visible / grabbable

## 4. Tests + gate

- [x] 4.1 `store-animation.test.ts` — id assignment, stack-on-collision keeps both,
      stack-more, unstack; relax exact keyframe assertions to `toMatchObject`
- [x] 4.2 Green gate: `typecheck` + `lint` + `test` + `build` for
      `@cg/shared-schema`, `@cg/template-runtime`, `@cg/designer`
- [x] 4.3 `pnpm openspec validate add-stacked-keyframes --strict`
