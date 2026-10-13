# Session AY — `D-154`: a box is edited through its CELL, and the gizmo is drawn where the element is

**Read at `c18e89c6b63e141ebc7ffe9bc857bff3d9cf3505`** — `HEAD == origin/dev`. The prompt allowed
"`f894d0e8` or later"; the delta is one commit, session AX's own patch (`B-148` + the import-once
guidance).

**Build links rebuilt:** `@cg/shared-schema` → `@cg/template-runtime` → `@cg/single-file-export` →
`@cg/designer`. The third link is the one that bites, and it mattered here — the `repunch` fix below
lives in `template-runtime` and only reaches the preview through `single-file-export`'s **dist**.

**Gate: green and uncached — `89 successful, 89 total` / `0 cached, 89 total`.**

---

## 1. §2's algebra — CONFIRMED, and pinned

`packages/vcg-format/tests/box-instance-transform-cancels.test.ts`:

```
plate.scene   = instance.pos + plate.local × preScale,  preScale = instance.size / comp.resolution
boxRelative.x = (plate.scene.x − instance.x) / instance.width = plate.local.x / comp.width
boxRelative.w =  plate.scene.width / instance.width          = plate.local.w / comp.width
```

⚠ **The discriminating case is a NON-UNIT `preScale`** — with an instance the same size as its
composition, `preScale = 1` and the cancellation is invisible. So the test instances ONE 960×540
composition at 960×540, at an offset, at 480×270 and at a non-uniform 1440×270, and requires
identical output. A control asserts the SCENE rect **does** still track the instance, so the four
equalities report a real cancellation rather than a derivation that ignores the instance.

⇒ **The authored instance transform reaches air through no route.** It survives only as the "As
authored" preview.

---

## 2. What changed — ONE value, several surfaces

A single resolver (`activeCellFor`) answers "does the active arrangement own this element's rect?",
and everything goes through it:

- **WRITE** — intercepted in `commitAnimatable`, the ONE chokepoint every geometry edit passes
  through: gizmo drag, gizmo resize, group move, Transform panel fields. Intercepting once is what
  makes _"the gizmo and the `CELLS` fields are two views of one value"_ true by construction rather
  than by four call sites remembering to agree.
- **READ** — the gizmo, the hit-test and the Transform panel all resolve the same way.
- **3.3 option (a)** — the Transform panel SHOWS and EDITS the cell. **(b) was refused**: it leaves
  two number sets on screen claiming to be the same thing, which is the shape this repo keeps paying
  for.
- **A box with NO cell** returns a `NO_CELL` sentinel, not `null`. Its geometry edits are **refused**
  — `null` would mean "geometry is the authored transform", which is this defect again in the one
  case where it is hardest to notice.
- **Non-box elements untouched**, asserted.

---

## 3. 🔴 The gizmo displacement, measured BOTH ways

|                                                        | width delta, gizmo vs rendered                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| before (reverted the one line in `Gizmo.tsx`, rebuilt) | **236 px** at 24 % zoom                                                                |
| after                                                  | **4 px** — a uniform 2 px outset on every side, **centres identical** (505.72, 233.80) |

⚠ **So the test asserts CENTRES, not a tolerance.** A 3 px allowance would have been a number chosen
to pass; a centre is the claim itself, and the old behaviour moved it by ~118 px. I had _guessed_
115 px for the width in a comment before measuring — the real figure is 236, and the comment now
carries the measured one.

---

## 4. 🔴 A SECOND bug, found by refusing to accept a screenshot

"As authored" looked plausible in the screenshot — empty stage, no cells, right label. Checking the
DOM instead showed the boxes **still parked at the last arrangement's cells** (`W=960px` rather than
their authored `1920px`).

**Cause:** `repunch` had a **default parameter** — `(view = arrangementView)` — so `repunch(undefined)`,
which is exactly what `setArrangementView(undefined)` sends for "As authored", fell into the default
and re-applied the PREVIOUS view. `undefined` is a MEANINGFUL value there ("no arrangement"), so it
must never stand in for "not passed". Fixed, measured red→green with the full chain rebuilt, and
pinned by an E2E.

**The lesson worth carrying:** a screenshot shows you what is drawn, not what is set. This one looked
right for the wrong reason — the stage is transparent, so a wrongly-sized box and a correctly-sized
one photograph identically.

---

## 5. What to check — the owner's own path

1. Three box compositions + 1/2/3-box arrangements.
2. **2-box active, select `box1`** — the selection rectangle is exactly on `cell 1`, and the Transform
   panel reads **X 0, Y 0, W 960, H 1080** (the cell, not the authored 1920×1080 instance).
   Screenshot: `ay-2-selected.png`.
3. **Drag `box1`** — `cell 1` moves with it and Transform reads **X 248.28, Y 165.52**; switching to
   **3-box shows every cell untouched** on its original grid. Screenshots: `ay-3-dragged-2box.png`,
   `ay-3b-3box-untouched.png`.
4. Select the background — ordinary Transform behaviour (asserted in the unit tests).
5. **"As authored"** — no cells drawn, boxes back at their authored geometry, and the panel says what
   that state is.

---

## 6. Flags

- 🔴 **A Linux `gate:e2e` is OWED.** ⚠ And note: **AX's run reads `cancelled`** (`32252553391`,
  `f894d0e8`), so AX's debt was not discharged by it.
  🔴 **CORRECTED 2026-08-19 (session AW), and the correction matters more than the original note:**
  I wrote here that it was cancelled by a superseding push and that this contradicts `P-027`. **Both
  halves were wrong.** The `e2e` job hit `timeout-minutes: 20` (it ran 20 m 16 s), and GitHub reports
  a timeout as `cancelled`. The timeline disproves the supersede reading outright — the next push was
  at 12:43:00 and the job ran on to 12:45:37. `P-027` stands; see its 2026-08-19 addendum for the rule
  (**read the duration before reading the word**).
- ⚠ **Rotation on a box under an arrangement is out of scope and falls through to the authored
  transform** (asserted). A cell is an axis-aligned rect; the node keeps its CSS rotation on top. If
  an author rotates a box, the cell and the rotation compose in a way nobody has specified.
- ⚠ **`D-160` is now a real string in tracked files** — in AX's handoff, describing the phantom.
  Recording a phantom created an occurrence of it; a future widening sweep will hit it. It is not a
  reservation.
- **Anchor drift:** none in this session's targets. `Gizmo.tsx:147`, `CanvasOverlay.tsx:344`,
  `TransformSection.tsx:38` and `timeline.ts:472` all read as expected.

---

## 7. PATCH 01 — item zero: `B-149`, the mask hole that reached air

Arrived after AY was pushed; done as a patch, before anything else.

**The defect.** `applyArrangementToNodes` writes all four geometry properties onto a box's node;
`liveArrangementView`, in the same file, read back only `left`/`top` and took width/height from the
AUTHORED rect. Every hole was punched **at the cell's position, at the authored size**.

🔴 **This one REACHED AIR** — unlike `D-154`, which never left the Designer. A hole larger than its
box opens the live layer BENEATH the template where no box exists: §1's crosstalk, arriving from
inside the feature built to prevent it.

### 🔴 The mechanism was CLOBBERING, not omission

`liveArrangementView` seeds its map from `base.geometry`, which already holds the **correct** cell. A
cell that only RESIZED a box added no readback entry, so the correct value survived — **that case was
never broken**. The fault was that the readback **OVERWROTE** the correct base entry with
`{cell position, authored size}` the moment it detected a MOVE.

⇒ **"Seed the base better" would have fixed nothing.** And it is why the test file keeps a size-only
case even though it passed before the fix: without it, a later change could repair the base and leave
the clobber standing.

### The axis nobody had asserted

C1's eleven-row UNIT B′ matrix asserted where the hole WAS — and **every one of its cases moved a box
without resizing it**, so a size-blind readback passed all eleven. That is the same one-axis blindness
AV found (the suite asked where the hole was, never where the box was) and AY found again (nobody
asked where the gizmo was), now a third time. **The pattern is worth naming: each of these suites was
thorough along the axis it already believed in.**

**Measured, red → green:** position-and-size punched `42,0 1851×1018` for a `922×534` cell before, and
the cell exactly after. At app level the hole came back **320 px** wide — the plate scaled by the
cell's 0.5 `preScale` — where the pre-fix value would have been the unscaled 640.

⚠ **On the visual evidence, honestly:** the after-screenshot is consistent but not decisive, because
the backdrop rectangle in my fixture does not cover the frame, so some of the checkerboard in it is
"no backdrop there" rather than "a hole". The decisive evidence is the red→green test and the 320 px
readback.

⚠ `scale` / `rotation` remain deliberately unread, and the comment now says why that is a DIFFERENT
case rather than the same one half-applied — so the distinction is not collapsed later.

---

## 8. CI

- ✅ **AY's Linux `gate:e2e` is DISCHARGED** — commit `039fe2b5`:
  <https://github.com/yasermostafaee/cg/actions/runs/32258009382>, `conclusion: success`, with the
  **`E2E (Playwright)` job having RUN** (`success`, not `skipped`).
- 🔴 **`B-149`'s commit owes its own run**, since it changes `@cg/template-runtime` — the render
  engine.
