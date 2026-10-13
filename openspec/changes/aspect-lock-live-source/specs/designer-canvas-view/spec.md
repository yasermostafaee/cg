# designer-canvas-view

## ADDED Requirements

### Requirement: A resize preserves a Live Source's declared aspect while the pointer moves

A resize gesture SHALL hold a locked plate's declared aspect for the WHOLE gesture, not merely at
its end. This applies to a `video-placeholder` whose `expectedAspect` is set and whose lock is on,
and to nothing else. The constrained quantity SHALL be the EFFECTIVE aspect —
`(w · scaleX) / (h · scaleY)` — and SHALL be read from the ONE definition that already owns it
(`effectiveAspect`, `aspect-presets.ts`), never re-derived as `w / h`.

`scale` SHALL NOT be written by a resize, so the solve SHALL be for `size` alone.

The constraint SHALL be applied to the free extents BEFORE they are turned into per-axis ratios,
leaving the fixed-corner position solve untouched.

#### Scenario: an edge handle derives the other axis

- WHEN an edge handle is dragged on a locked plate
- THEN the free axis follows the pointer and the other is DERIVED from it
- AND the effective aspect stays within `ASPECT_TOLERANCE` at every emitted rect across the whole
  drag

#### Scenario: a corner handle projects onto the constrained diagonal

- WHEN a corner handle is dragged on a locked plate
- THEN the pointer is PROJECTED onto the line through the FIXED corner whose slope is the locked
  ratio, and the rect is built from that projection

#### Scenario: crossing the diagonal produces no jump

- WHEN a corner drag's pointer path CROSSES the constrained diagonal
- THEN the emitted rect has NO discontinuity

#### Scenario: the MIN_SIZE clamp keeps the aspect

- WHEN the driving axis is clamped to `MIN_SIZE`
- THEN the derived axis is recomputed from the CLAMPED value, so the effective aspect still holds

#### Scenario: the fixed corner still does not move

- WHEN a locked plate is rotated and/or non-uniformly scaled and any handle is dragged
- THEN the fixed corner stays exactly where it is, as it does for an unlocked element

#### Scenario: everything else resizes exactly as before

- WHEN the element has no `expectedAspect`, or is not a Live Source, or the lock is OFF
- THEN the resize is byte-identical to the behaviour before this change

### Requirement: The corner rule is a projection, never a dominant axis

The corner solve SHALL project the pointer onto the constrained diagonal. It SHALL NOT choose a
driving axis by which extent is larger.

⚠ **CORRECTED DURING IMPLEMENTATION, 2026-08-25.** This requirement was written justifying the
projection on the grounds that a dominant-axis rule "flips which axis drives at the moment the
pointer crosses the diagonal, and the box visibly JUMPS mid-drag". **That is FALSE and was
measured to be false**: at the crossover `w / ratio === h` makes both branches of the
dominant-axis rule return the same pair, so it is CONTINUOUS there. Across a sweep the largest
step between consecutive outputs measured 1.76 px for the projection and 5.33 px for
dominant-axis — neither is a jump.

The requirement STANDS; only its reason changes. The two rules differ in FEEL, not in
continuity: dominant-axis returns the smallest box containing the pointer's larger extent (at
extents `(1600, 200)` with a 16:9 lock, `1600 × 900`), while the projection returns the nearest
point on the diagonal (`1301 × 732`). The projection is the chosen behaviour.

The rejection SHALL be recorded in a comment at the implementation — **with the corrected
reason**, because a comment that justifies a decision with a disproved fact invites the next
reader to undo the decision.

The tests SHALL pin the CHOICE by VALUE, off the diagonal where the two rules disagree. A
continuity assertion SHALL NOT be relied on to distinguish them, because both satisfy it.

#### Scenario: the rejection is discoverable, and its reason is true

- WHEN a reader opens the corner solve
- THEN a comment states that the dominant-axis rule was considered, why it was rejected, and
  that the continuity argument against it does not hold

#### Scenario: the choice is pinned by value

- WHEN a corner is dragged to extents where the two rules disagree
- THEN the emitted rect is the projection's, and a test asserts that value specifically

### Requirement: The one-shot fit's bottom-edge flip is not ported into the drag

The drag SHALL NOT swap which dimension it preserves, and a plate dragged out of frame SHALL
remain an ordinary preflight error. `fitToAspect` does swap — it preserves `h` and solves for `w`
when solving for `h` would push the plate past the bottom of the frame — and that is right for a
ONE-SHOT button, where the author sees a single result, and wrong for a LIVE gesture: swapping
which axis is preserved part-way through a drag changes the solution the box is tracking, so the
box relocates under a pointer that did not change direction.

⚠ This reason was CORRECTED with the one above it (2026-08-25). It previously read "the same
visible jump a dominant-axis rule produces" — an appeal to a jump that was measured and does not
exist. The requirement is unchanged; only its justification is.

A comment at the drag path SHALL say so, because the flip is present in the very function the drag
reuses and would otherwise read as forgotten rather than declined.

#### Scenario: a locked drag past the bottom of the frame does not flip

- WHEN a locked plate is dragged so that the derived height would cross the bottom of the frame
- THEN the preserved axis does NOT change and the plate is allowed to leave the frame
- AND the existing off-frame preflight error is what reports it

## MODIFIED Requirements

### Requirement: The canvas gesture layer's modifier keys

`Shift` SHALL continue to override snapping in the resize and rotate gestures, and `Alt` SHALL
continue to override snapping in the single-element and group move gestures (`D-122`).

The aspect lock SHALL NOT bind a keyboard modifier. Both plausible keys are already spent on the
same job — bypass snapping — so overloading either would put two meanings on one key in one
canvas, and inventing a third chord for a feature that has a visible toggle is worse than having
no keyboard path at all.

⚠ That `Shift` and `Alt` mean the same thing in different gestures is a real inconsistency. It is
`D-156`'s, NOT this change's, and SHALL NOT be folded in here.

#### Scenario: no new modifier is introduced

- WHEN a locked plate is resized with any modifier held
- THEN the modifier's existing meaning applies and none of them unlocks the aspect
- AND the only way to resize freely is the toggle
