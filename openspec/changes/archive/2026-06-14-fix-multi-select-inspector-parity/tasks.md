# Tasks — fix-multi-select-inspector-parity

## 1. Shared field render helpers (single source)

- [x] 1.1 New `features/inspector/transform-fields.tsx`: move `FieldBody`/`Seg`/
      `SingleField` from `TransformSection` with `point?` optional + a new
      `mixed?`; add `TRANSFORM_FIELD_META` (icon/ariaLabel/suffix/step/min/max/
      toDisplay/fromDisplay per transform prop)
- [x] 1.2 `RealtimeNumberInput` (controls.tsx): add `mixed?`/`placeholder?` — when
      mixed, show empty + placeholder (neutral state), still commit on scrub/type
- [x] 1.3 Refactor `TransformSection` to consume the shared helpers +
      `TRANSFORM_FIELD_META`; output IDENTICAL (single inspector unchanged)

## 2. MultiSelectSection parity

- [x] 2.1 Rebuild `MultiSelectSection`: transform props via `Seg`/`SingleField` +
      `TRANSFORM_FIELD_META` under `<CollapseSection title="Transform" pinned>`
      (same layout/order as single, no diamonds), with units (opacity `%`) and
      `mixed` support; fill via `FillField` under `Path Style`
- [x] 2.2 Each field commits via `meta.fromDisplay` → `applySharedProperty`
      (group-edit semantics UNCHANGED — one undo, keyframe-free)

## 3. Per-shape selection boxes

- [x] 3.1 `MultiGizmo` (Gizmo.tsx): one solid selection box per selected shape
      (`data-testid="multi-select-box"`); REMOVE the union box
      (`s.frame`/`multi-select-bbox`); add the per-shape box CSS class
- [x] 3.2 Confirm `CanvasOverlay.onPointerDown`/`beginGroupDrag` need NO change
      (press-member drags; empty-space press clears — already the behaviour)

## 4. Tests

- [x] 4.1 Unit (jsdom render): the multi editor renders opacity with `%`, groups
      transform props under Transform, and uses the same primitive as single for a
      homogeneous selection; a mixed field shows the mixed state via the right
      primitive; a group edit through the shared path is still ONE undo entry
      (regression guard, unchanged from D-041)
- [x] 4.2 E2E `multi-select.spec.ts` (+ fixtures): two shapes → inspector shows
      grouped, unit-bearing drag inputs (opacity `%`) → each shape has its own box
      and there is NO group box → press one shape + drag → both move (one undo) →
      press empty space between them → selection not dragged; run `pnpm test:e2e`

## 5. Docs + gate

- [x] 5.1 Engine doc-sync: `features/canvas/README.md` (per-shape boxes) +
      `state/README.md` if the multi-editor description needs it
- [x] 5.2 Full green gate (format:check + typecheck + lint + test + build), test
      uncached once (`turbo --force`);
      `pnpm openspec validate fix-multi-select-inspector-parity --strict`
