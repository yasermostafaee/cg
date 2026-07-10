# Design — fix-pen-curve-and-hit-test (B-053 / B-054 / B-055)

## Recon findings (2026-07-10, post-B-037/B-051 main; red unit tests against the live store)

### B-053 — the guard fires on every human click, and never resets

`pen-draw.ts`'s `onMove` flipped the last anchor smooth once cumulative motion exceeded **3 SCENE
px** and nothing ever cleared it. Two compounding defects, both proven red:

- **Unit mismatch**: the guard was in scene px while a click slip is a screen-px phenomenon — at
  fit zoom (~0.3) a 1-screen-px slip is already ~3.2 scene px, so ordinary clicks curled. Red
  test: a 2-screen-px slip at scale 0.5 produced a smooth anchor.
- **Incremental, never revisited**: once smooth, always smooth — a drag-out-and-back release kept
  the handles of the largest excursion. Red test: move +20 px then back to +1 px, release →
  smooth.

### B-054 — no smooth insertion path exists, and the fallback is a dead end

`insertOnSegment` created a corner mid-point only. The prompt's "acceptable alternative" (insert a
corner, then pull handles out) was checked and REFUTED as a fallback: `PathEditor` renders handle
dots only for an anchor's EXISTING `in`/`out` (a fresh corner has neither — nothing to grab), and
`dragHandle` computes `smooth = breakPair ? false : p.smooth` — it never converts a corner TO
smooth. Drag-on-insert is therefore the only real option (and matches the pen's gesture).

### B-055 — anchors-only geometry in both hit tests

`hitsPath` built its polygon from the anchor points and measured stroke distance to the straight
chords — curvature was invisible. Red tests: a bulge point outside the anchor polygon missed; a
concavity point inside the anchor polygon false-hit; an open two-anchor arc was only grabbable at
its straight chord. Bonus defect found by the open-arc red test: the display mapping collapsed a
degenerate anchors-bbox axis to factor 0 (`bbox.h === 0 → fy = 0`) — fine for straight lines,
wrong for curves extending past the degenerate bbox; the runtime's viewBox clamps with
`max(bbox, 1)` instead, and the hit-test now mirrors that exactly.

## Decisions

### D1 — decision at pointer-UP, screen-px guard, live preview kept (B-053)

`PEN_SMOOTH_PX = 3` SCREEN px (exported), the same magnitude and unit as the D-122 drag
hysteresis and beginDrag's click-vs-drag guard — constant at every zoom. During the hold, `onMove`
previews live (smooth above the guard, corner restored when the pointer dips back under it) so
what the operator sees at any instant is what release would produce; `onUp` makes the final call
from the release event's total displacement and actively clears jitter-set handles. Only the
just-placed anchor is ever touched (captured by reference and re-validated against the live draft,
so a finish/cancel/stale-drop mid-gesture makes the up-handler a no-op) — a previous smooth
anchor's handles are never modified, which is exactly the owner's Illustrator rule: `pathD` curves
a segment when EITHER side has a handle, so the corner's incoming side keeps the prior anchor's
curve for free.

### D2 — drag-on-insert, not handle-pulling (B-054)

Preferred interaction implemented: pointer-down on a segment inserts the corner mid-point
immediately (as today, so a plain click is unchanged), then window move/up listeners run the pen's
drag-to-smooth: mirrored handles follow the drag live (`smooth: true`, `out = drag`,
`in = −drag`, in point-space units via the same `/scale/sx|sy` mapping `dragHandle` uses), and the
same at-release screen-px decision applies. The corner reconstruction builds a fresh
`{id, x, y, smooth: false}` (no `in`/`out` keys) rather than assigning `undefined`. The history
boundary moved from insert-time to pointer-up so the whole insertion (corner or smooth) is ONE
undo entry; edits still route through `applyPoints` → `normalizePathPoints` → `updateElement`
(the mid-point lies inside the anchors' bbox, so normalize is an identity during the gesture —
unit-tested round-trip).

### D3 — flatten the exact rendered cubics; stay pure (B-055)

Chosen option: flattening, not `Path2D`. `hit-test.ts` is deliberately pure (no React/store/DOM —
the canvas README calls this out as what keeps it unit-testable), and jsdom has no real 2D canvas,
so `isPointInPath` would break both the module contract and the test environment. Each segment
flattens from the exact cubic the runtime renders (`c1 = a + a.out`, `c2 = b + b.in`; straight
only when BOTH handles are absent — mirroring `pathD` including its close-segment handling), with
**CURVE_STEPS = 16** fixed samples per curved segment: a chord's max deviation shrinks ~1/N², so
even a segment spanning the full 1920-px frame stays within ~2 px of the true curve — far inside
the ~6-px grab margin — while the cost is ≤ 16 extra ray-cast edges per curved segment, rebuilt
per hit-test call (no caching needed at click frequency). The anchors-bbox display mapping is
kept (it is what the runtime's viewBox uses; flattened samples may land outside `0..size` exactly
like `overflow: visible` renders them) with one correction: `size / max(bbox, 1)` — the runtime's
own viewBox clamp — replaces the `extent 0 → factor 0` collapse (see recon).

### D4 — out of scope, noted

- Shape-preserving insertion (de Casteljau split so adding a point does not change the curve) —
  the insert changes the local shape today for corner inserts already; a follow-up if the owner
  wants Illustrator-exact add-anchor.
- `pathBBox` (gizmo box, runtime viewBox) still measures anchors only — a bulge can extend past
  the gizmo; pre-existing, unchanged here (the hit-test handles it via the clamp + overflow
  semantics).
