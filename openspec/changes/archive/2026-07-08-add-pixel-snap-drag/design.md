# Design — pixel-snap drag and nudge at grid zoom (D-122)

## Context

Recon of the move stack (drag + nudge) established:

- **Single drag** (`beginDrag`, CanvasOverlay.tsx:488): `onMove` computes `nx = startPos + dx`,
  optionally smart-snaps (to element/canvas edges, gated on `snappingEnabled`), then B-027
  clamps, then commits LIVE per pointer-move via `commitAnimatable('position.x'/'position.y')`.
- **Group drag** (`beginGroupDrag`): snaps the ANCHOR, derives the anchor's snapped delta
  `fdx/fdy`, clamps it, applies `m.x + fdx` to every member (relative offsets preserved).
- **Arrow nudge** (`nudgeSelection`, elements.ts:576): a shared relative delta over the same
  movers + clamp; keyframe-aware; NO snapping. Driven by the App.tsx window keydown, which had
  no access to the canvas zoom.
- **Grid gate**: `pixelGridVisible(zoom)` (`zoom ≥ PIXEL_GRID_MIN_ZOOM = 8`, i.e. 800%).
- **Zoom** is CanvasArea-local React state (the drag path already receives it as `scale`); the
  keyboard nudge did not.
- **Alt** was an inert bail-out in both move paths (only real Alt use: PathEditor bezier
  break-pair, a separate overlay).

## Decisions

### D1 — Snap LIVE during the drag (not on release)

The snap rounds the target position on every pointer-move, so the element and its gizmo visibly
track whole pixels under the pointer (the owner asked to "drag around and every drop lands on a
line"; live feedback makes that legible while dragging, not a surprise jump at release). Commit
is already live per move, so this is a one-line change in the existing `onMove`.

### D2 — At grid zoom the pixel grid IS the snap target (supersedes smart guides)

At 6400% the smart-guide threshold (`6 / scale`) is ~0.09 scene px — effectively unreachable —
so element-edge snapping is moot there, while the pixel grid is the visible, useful target. So
at grid zoom (Snapping on, no Alt) the drag ROUNDS to the nearest whole pixel and draws no
smart-guide lines (the always-visible grid is the guide). Below the threshold, smart-guide
snapping is unchanged. This avoids a "which snap wins" contest and makes the result predictable:
at grid zoom every committed move coordinate is a whole pixel.

### D3 — Gate = `snappingEnabled && !alt && pixelGridVisible(zoom)`

The View-menu **Snapping** preference is the master snap switch and governs pixel-grid snapping
too, so `designer-canvas-view`'s "Snapping off drags freely" stays literally true (turning
Snapping off gives free movement at ANY zoom). **Alt** is the momentary bypass. Snapping is ON
by default, so at grid zoom the owner gets pixel snap out of the box. One pure predicate
`pixelSnapActive(zoom, snappingEnabled, alt)` is shared by the drag path, the nudge path, and
the unit tests.

Alt now bypasses ALL snapping (smart guides too) at any zoom — a small, defensible extension
(previously Alt-drag still smart-snapped): "Alt = free placement" is the standard design-tool
idiom and matches the PRD wording ("Alt … free sub-pixel placement").

### D4 — Nudge first-snap is direction-aware and magnitude-independent

`snapNudgeToPixel(coord, signedStep)`:

- `coord` already on the grid (within a float epsilon) → `round(coord) + signedStep` (steps by
  1 or, with Shift, 10).
- `coord` fractional → `signedStep > 0 ? ceil(coord) : floor(coord)` — the NEXT integer in the
  nudge direction, **regardless of |signedStep|**. So a Shift nudge off a fractional value still
  just lands on the grid (PRD: "accelerated nudge variants follow the same rule"); the 10px
  stride resumes once on the grid. This is the least surprising reading of "moves it to the next
  integer in the nudge direction" and is documented here so a future reader doesn't "fix" it to
  `ceil(coord) + 9`.

The nudge applies the snap to the ANCHOR (the primary selected element) and moves the group by
the resulting shared delta — identical to the group-drag anchor rule, so `designer-multi-select`'s
"same delta for every member" invariant holds and only the anchor lands exactly integer (a
multi-selection with mixed fractional members keeps its relative offsets).

### D5 — Order: snap THEN clamp; integer output for the normal case

Snapping runs before the existing B-027 clamp (unchanged). For an integer-dimension box (the
norm — rectangles, images) the clamped result stays exactly integer: the snapped position is
integer, the pasteboard bounds are integers (`−margin`, `frame + margin`, `PASTEBOARD_MIN = 5000/
3000`), so `clampDeltaToPasteboard` returns an integer delta. The only way to get a sub-pixel
result is a FRACTIONAL-size box pinned exactly at a pasteboard edge — a corner the 5000px margins
make unreachable in normal pixel-perfect editing; documented, not guarded.

### D6 — Zoom to the keyboard nudge via a store mirror

The nudge lives on the App.tsx window keydown and can't read CanvasArea's local zoom. Rather than
relocate the handler, `canvasZoom` is mirrored into the store (a `setCanvasZoom` published by a
CanvasArea effect on `zoom`); `nudgeSelection` reads it for the gate. Minimal, and the value is
session-only editor state like the other view flags.

## Out of scope — resize-handle snapping (follow-up)

D-122 is element MOVE only. Snapping a RESIZE to whole pixels (whole-pixel dimensions / edges)
is the natural companion and would reuse `pixelSnapActive` + `snapDragToPixel` in `beginResize`
(Gizmo.tsx), but it has its own decisions (which handle/edge snaps, minimum size interaction,
aspect-lock) and is left as a follow-up item. Noted so the omission is deliberate, not an
oversight.

## Spec reconciliation (CLAUDE.md spec discipline)

- `designer-canvas-view` — MODIFY "Snap-while-dragging" to name the Snapping preference the
  master switch (also governs pixel snap) and Alt the momentary bypass; ADD "Pixel-snap moves to
  the grid at high zoom".
- `designer-multi-select` — MODIFY "Arrow-key nudge for the selection" to add the grid-zoom
  first-snap + Alt bypass (shared anchor delta unchanged).
- `designer-canvas-viewport` — MODIFY the B-042 gizmo honesty scenario: its "(e.g. x = 2.2749,
  the drag scenario)" example is now stale (a plain drag SNAPS), reworded to Inspector / Alt-drag.
  The honesty requirement is otherwise unchanged — fractional placement stays reachable (Inspector,
  Alt) and honestly rendered between the lines, which is exactly what D-122's Alt bypass preserves.

## Review-driven fixes (adversarial pass on the diff)

Two pre-existing defects the review surfaced, both in the exact paths D-122 touches and both
now visible BECAUSE D-122 makes high-zoom move a first-class workflow — fixed here:

1. **Phantom keyframe on the un-nudged axis.** `nudgeSelection` committed BOTH axes for every
   mover unconditionally. A single-axis arrow nudge left the other delta at 0, but
   `commitAnimatable` is keyframe-aware: writing the unchanged value to an ANIMATED axis upserts
   a keyframe at the playhead (same value, default easing → re-linearizes the segment and
   distorts the motion). Fixed by committing only the axis whose applied (clamped) delta is
   non-zero. Regression test in `multi-select.test.ts`; spec scenario added (single-axis nudge
   does not keyframe the other axis).

2. **Click-vs-drag dead zone in scene px.** The engagement threshold was `|dx|+|dy| < 2` in
   SCENE px = `2·zoom` SCREEN px — 16 px at 800%, 128 px at 6400%, so a pixel-perfect drag
   couldn't even engage until the pointer had travelled 128 px. Replaced with a constant
   ~3-SCREEN-px hysteresis (both `beginDrag` and `beginGroupDrag`), so a drag engages responsively
   at every zoom while still swallowing a shaky click. Directly serves D-122's "drag around and
   every drop lands on a line".

## Verification

- Pure unit tests for `pixelSnapActive` (threshold / snapping-off / Alt), `snapDragToPixel`
  (round-half), `snapNudgeToPixel` (fractional dir-aware, integer step, Shift magnitude, epsilon).
- E2E at 6400%: drag lands integer X/Y; fractional first-nudge → integer (right and left); Alt
  nudge preserves the fraction; and at 400% (below threshold) the nudge stays relative.
- Owner verification on their machine before any commit (drag lands on lines; Alt-drag free;
  nudge from a fractional start), per the standing process rules.
