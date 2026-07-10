# Pen curve placement, smooth insertion, curved hit-testing (B-057 / B-056 / B-055)

> NOTE (2026-07-10): two of these bugs were RENUMBERED after cross-track collisions (owner rule:
> the runtime track keeps its numbers). The smooth-drag bug was filed and merged (#272) as
> **B-053** → now **B-057** (runtime's #271 filed its own B-053 first); the smooth-insertion bug
> was filed as **B-054** → now **B-056** (runtime's #273 filed a different B-054). This archive's
> docs were updated in place; #272's commit/PR text retains the historic numbers.

## Why

Bézier curves were half-implemented across three seams (all owner-reported):

1. **B-057 (medium)** — smooth-drag "sticks": the pen's drag-to-smooth flipped the last anchor
   smooth incrementally during the hold and NEVER reset it, with the guard measured in SCENE px —
   at fit zoom a 1-screen-px click slip already exceeded it, so virtually every human click placed
   a smooth anchor and curvature "carried over" to points meant as corners.
2. **B-056 (medium)** — a finished path could only gain CORNER anchors: segment-click insertion
   had no drag-to-smooth, and the fallback (pulling handles out of a corner) doesn't exist — a
   corner renders no handle dots and `dragHandle` never sets `smooth`.
3. **B-055 (high)** — clicking a curved shape only selected near its center: `hitsPath` ray-cast
   the ANCHORS-ONLY polygon (and measured stroke distance to the straight chords), so curve bulges
   outside the anchor polygon missed and concavities false-hit. A two-anchor closed arc (zero-area
   anchor "polygon") was selectable only within the grab margin of its chord.

## What Changes

- **B-057 — corner vs smooth decided AT POINTER-UP** (owner decision 2026-07-08, Illustrator
  semantics): the total displacement against a SCREEN-px guard (`PEN_SMOOTH_PX = 3`,
  zoom-independent — the D-122 hysteresis lesson) decides; a click-sized gesture actively CLEARS
  any jitter-set handles at release (the mid-hold preview stays live), and a corner placed after a
  smooth anchor leaves the previous anchor's handles untouched (the shared segment keeps its
  smooth side — `pathD` already curves on either side's handle).
- **B-056 — click-DRAG on a segment inserts a SMOOTH anchor**: the pen's drag-to-smooth gesture on
  insertion (mirrored handles follow the drag, live), with the same at-release corner/smooth
  decision; a plain click stays a corner. One undo entry per insertion (the boundary moved to
  pointer-up).
- **B-055 — hit-test the flattened curved outline**: `hitsPath` flattens each segment from the
  exact cubic the runtime renders (`c1 = a + a.out`, `c2 = b + b.in`; straight only when both
  handles are absent — mirrors `pathD`) into 16 line sub-segments, then runs the existing
  ray-cast (closed fill) and grab-margin (stroke) tests over the flattened outline. The module
  stays pure (no canvas/`Path2D` — unit-testable in node). The display mapping now mirrors the
  runtime viewBox's `max(bbox, 1)` clamp, fixing the degenerate-axis collapse that flattened a
  two-anchor arc's curve extent to zero.

## Capabilities

- **`designer-path-element`** (MODIFIED ×3): "Pen tool draws a bézier path" (pointer-up placement
  decision + smooth-side preservation), "A selected path is fully editable" (segment click-drag
  inserts smooth), "Gizmo + outline hit-test" (curved outline: bulges hit, concavities miss).

## Impact

- `apps/designer/src/renderer/features/canvas/pen-draw.ts` — placement decision at pointer-up;
  `PEN_SMOOTH_PX` screen-px guard.
- `apps/designer/src/renderer/features/canvas/PathEditor.tsx` — `insertOnSegment` drag-to-smooth.
- `apps/designer/src/renderer/features/canvas/hit-test.ts` — cubic flattening + viewBox-clamp
  mapping.
- Tests: NEW unit `pen-smooth-placement.test.ts` (red pre-fix) and `path-hit-curved.test.ts`
  (red pre-fix); `path-tools.test.ts` extended (smooth-insert normalize round-trip); NEW E2E
  `pen-curve-edit.spec.ts` (slip-click corner, drag-insert smooth, curved-lens selection).
- Docs: PRD B-057/B-056/B-055; canvas README pen + hit-test sections (engine doc-sync).
