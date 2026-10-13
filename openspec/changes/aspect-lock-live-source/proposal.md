# A Live Source with a declared aspect keeps it DURING the resize

## Why

[`D-155`](../../../docs/prd/designer.md). The author's words:

> _"In the Designer, when I add a Live source and its aspect is 16:9, the resize must PRESERVE
> that aspect while I drag — not let me deform it and then make me press a button to fit it
> back."_

`D-147` gave a Live Source a declared `expectedAspect` and a **Fit plate to aspect** button, and
nothing between the two. The drag is free, so every resize of a 16:9 plate is a deformation
followed by a repair the author has to remember to perform. The declaration already exists and is
already authoritative — the gesture is simply not reading it.

⚠ **What the lock is FOR, stated because the obvious guess is wrong.** It stops background GAPS —
an author-shaped hole that does not match the feed's shape. It is **not** a crop-prevention
feature: what a mismatched aspect COSTS at runtime is a separate question and is moving. **No
comment, spec text or task written for this change may claim the lock prevents cropping.**

## What Changes

- **The resize gesture constrains the EFFECTIVE aspect** — `(w · scaleX) / (h · scaleY)` — for a
  `video-placeholder` whose `expectedAspect` is set and whose lock is on. Edge handles derive the
  other axis; corner handles project the pointer onto the constrained diagonal.
- **A lock toggle beside the aspect select** in the Inspector's Live Source section, on by default
  whenever `expectedAspect` is set. It is a **session preference**, not authored state, and there
  is **no keyboard override**. **`B-218` (2026-09-04): it is held PER PLATE** — the toggle beside a
  plate reads and writes that plate's own lock, keyed by its element id; the first spelling was one
  shared boolean and freeing one box freed every box in every look.
- **The FIT button survives with a changed job** — a repair for a plate authored before the lock,
  or one deformed with the lock off, rather than the normal path.
- **The `CELLS` number fields honour a lock too**, on a DIFFERENT quantity — the composition's
  resolution aspect. See the §"a cell has no aspect" requirement, which is the load-bearing
  correction in this change. Since `B-218` they carry a toggle of their own, per arrangement.

## Capabilities

Three, across two in-flight changes and one living spec. **That spread is why this is its own
change** rather than an amendment to either in-flight one: no existing change owns even two of
them, and folding a canvas-gesture rule into `live-source-multibox` or `multibox-layout-switch`
would make that change's archive wait on a feature it does not own.

| capability                       | status                                               | this change             |
| -------------------------------- | ---------------------------------------------------- | ----------------------- |
| `designer-canvas-view`           | LIVING spec                                          | `MODIFIED Requirements` |
| `designer-live-source`           | in flight, owned by `live-source-multibox` (`D-147`) | `ADDED Requirements`    |
| `designer-multibox-arrangements` | in flight, owned by `multibox-layout-switch`         | `ADDED Requirements`    |

⚠ **Neither in-flight change is edited by this one, and no archive is touched.** When they archive,
their capabilities become living specs and this change's deltas fold on top in the ordinary way.

## Impact

- `apps/designer/src/renderer/features/canvas/geometry.ts` — the constraint reshapes `wNew`/`hNew`
  inside `computeRectResize`, BEFORE the ratios are taken. Nothing else in that function moves.
- `apps/designer/src/renderer/features/inspector/aspect-presets.ts` — the ONE definition of the
  constrained quantity. If the shape the gesture needs is not exported yet, it is exported FROM
  HERE.
- `apps/designer/src/renderer/features/canvas/Gizmo.tsx` — the single `computeRectResize` call.
- `apps/designer/src/renderer/features/inspector/StyleSection.tsx` — the toggle and the FIT
  button's changed wording.
- `apps/designer/src/renderer/features/inspector/ArrangementsSection.tsx` — the `CELLS` fields.

### 🔴 It depends on `B-175`, which is already fixed

`B-175` (the gizmo drew from one rect and computed against another) landed first, deliberately.
Without it the lock would have constrained the AUTHORED rect while the author watched the CELL, so
the feature would have been wrong on exactly the multi-box templates it exists for. The
precondition is pinned by `apps/designer/tests/arrangement-gizmo-read.dom.test.ts`
(_"the aspect the lock will constrain is the DRAWN one"_).
