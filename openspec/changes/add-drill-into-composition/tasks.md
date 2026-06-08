## 1. Hit-testing + drill geometry

- [x] 1.1 `features/canvas/hit-test.ts` — extract `inverseToLocal(element, point)`
      (the unscaled-local-box point); `hitsElement` bounds-tests its result.
- [x] 1.2 `features/canvas/drill.ts` (new) — `drillTarget(instance, child, point,
      frame)`: invert the instance transform → local box → scale into the child's
      resolution, then `topmostHit` the child's elements at their effective frame.
      Returns `{ compositionId, shapeId | null }`; one call = one level.

## 2. Store + canvas wiring

- [x] 2.1 `state/store.ts` — `openCompositionAndSelect(childId, shapeId | null)`:
      atomic switch of `activeCompositionId` + selection (equivalent to opening from
      the list + selecting). No-op for an unknown id. No per-instance overrides.
- [x] 2.2 `features/canvas/CanvasOverlay.tsx` — `onDoubleClick` drills a composition
      instance via `drillTarget` + `openCompositionAndSelect`; text keeps inline
      edit; single-click (onPointerDown) still selects the instance as a unit.

## 3. Tests + gate

- [x] 3.1 `apps/designer` — `drillTarget` (1:1, empty child space, scaled instance,
      non-composition → null); single-click `topmostHit` returns the instance unit;
      `openCompositionAndSelect` switches context + selects (+ null + unknown id).
- [x] 3.2 Green gate: typecheck + lint + test + build for `@cg/designer`.
- [x] 3.3 `pnpm openspec validate add-drill-into-composition --strict`.
