# Tasks — `resize-snaps-the-edge` (`B-181`)

## 0. The phantom, and the overstated claim next door

- [x] 0.1 `B-181` filed at `docs/prd/bugs-designer.md`, carrying both owner reports verbatim, the
      code excerpt, and the measured explanation of why the lock exposes it
- [x] 0.2 The six `[[B-181]]` cross-references inside `B-180` **now resolve**, because the number
      this session took IS the one they were written forward to. The prior session's
      "⚠ `B-181` DOES NOT EXIST" note is itself now false and was corrected in place; the
      struck-through paragraph it annotated is restored
- [x] 0.3 Registry claim section appended for `B-181` + `B-182`, recording the **sixth phantom** of
      this class — and the hole where `B-180`'s own claim section should have been (filed
      2026-08-26, never logged here)
- [x] 0.4 `B-180`'s and `D-122`'s "commits whole scene pixels at EVERY zoom" corrected to what was
      actually built — a quantised POINTER — with the five DELIBERATE exceptions enumerated
- [x] 0.5 The eight genuine gaps filed separately as `B-182`; this session did not grow to fix them
- [x] 0.6 The falsified `Gizmo.tsx` comment (_"for an unrotated element that also makes the
      committed size and position whole"_) corrected in the file it lives in

## 1. Snap the EDGE, not the pointer

- [x] 1.1 `resizeMovingCorner(handle)` — the corner opposite the fixed one
- [x] 1.2 `movingCornerScene(t, rect, handle, solved)` — where the moving edge LANDED, read off the
      solved rect and never off the pointer
- [x] 1.3 `pointerForMovingEdge(…)` — the inverse, beside `computeRectResize` / `lockExtents`, with
      its contract in its name and its `null` cases stated
- [x] 1.4 `Gizmo.tsx` re-ordered: solve → read edge → test targets → re-solve through the SAME
      solver
- [x] 1.5 **No second solver opened in the gizmo** — the inverse produces a pointer and hands it
      back to `computeRectResize`

## 2. The guide

- [x] 2.1 Emitted from the FINAL rect, only where the committed edge is within `noiseFloor` of a
      target (`B-180`'s floor, reused) — so a guide cannot announce a snap the geometry refused
- [x] 2.2 Proven: with the old code, one corner drag published guides on BOTH axes while the box
      was on neither

## 3. The corner decision (task 3 of the brief)

- [x] 3.1 `chooseEdgeSnap` — **nearest target wins, `x` on a tie** — with the reasoning in its
      docstring and in `design.md` §4
- [x] 3.2 The forced axis gets a guide only if it lands genuinely ON a target
- [x] 3.3 Stated in the `B-181` item with its reasoning
- [x] 3.4 Pinned by value in BOTH directions (x wins, then y wins on the same drag with the
      competing guide moved 5 px)

## 4. Unchanged — confirmed explicitly, one by one

- [x] 4.1 `SNAP_PX = 7` (`Gizmo.tsx:47`) — untouched
- [x] 4.2 `thr = SNAP_PX / scale` (`:461`) — untouched
- [x] 4.3 `buildSnapTargets` — untouched (already canvas + every other element + ruler guides)
- [x] 4.4 `B-175`'s `renderedTransformAt` rule inside it — untouched
- [x] 4.5 `lockRatio` resolved once at press — untouched
- [x] 4.6 The `t0.rotation === 0` snapping gate — untouched
- [x] 4.7 `Shift` as the bypass — untouched, no second modifier invented

## 5. Tests

- [x] 5.1 `resize-edge-snap.dom.test.ts` — the gesture DRIVEN through the real gizmo (pointer
      events on the real handles), because a unit test composing the helpers the way the fixed
      gizmo composes them would pass against the broken tree
- [x] 5.2 🔴 The discriminating fixture: aspect-locked `br` at pointer `(1000, 597)` — the pointer
      sits EXACTLY on the target while the locked corner lands at `996.0474777448071`, 3.95 px
      short and inside the 7 px threshold. Edge AND guide asserted by value
- [x] 5.3 The locked CORNER decision, pinned by value both ways
- [x] 5.4 Positive control: the UNLOCKED gesture, corner and edge, unchanged
- [x] 5.5 A LOCKED EDGE handle — the fixture that CANNOT see the bug — asserted unchanged, and
      recorded as such so nobody builds the discriminating case out of one
- [x] 5.6 `live-source-preflight` finds NO overlap for the resulting flush scene — rule and gesture
      in ONE test on the SAME fixture
- [x] 5.7 `Shift` ⇒ no snap, no guide, fraction preserved
- [x] 5.8 `resize-edge-geometry.test.ts` — the inverse's own unit tests, including the round trip
      on every handle and both axes, and the `null` cases
- [x] 5.9 🔴 **Discrimination proved by reverting.** With the whole mechanism restored to
      pointer-space snapping: 4 of 11 turned RED (the edge landing, the preflight case, and both
      corner-decision tests) while every positive control stayed GREEN — which is exactly the
      right shape, since those are the paths that already worked
- [x] 5.10 Full designer unit suite: 1377 passed, no regressions

## 6. Gate

- [x] 6.1 Full green gate as plain `pnpm gate` — **89 successful, 0 cached, 89 total**;
      `format:check` clean; `openspec validate --all --strict` 67 passed, 0 failed
- [x] 6.2 Local `pnpm gate:e2e` (Windows, non-authoritative): designer **275 passed**, runtime
      **93 passed**, 23/23 tasks
- [x] 6.3 Pushed to `dev` as **`05318016`** (`053180168de345a0739674ad9e174deb8fe485ff`);
      `git ls-remote origin dev` matches local `HEAD`
- [ ] 6.4 ⚠ **The push run for `05318016` did NOT discharge anything.**
      <https://github.com/yasermostafaee/cg/actions/runs/32984155276> came back
      **`startup_failure`** with both heavy jobs **`skipped`**. Under the discharge rule that is
      neither a pass nor a fail and proves nothing — a SKIPPED `e2e` is a statement about the run,
      not evidence about the suite. Nothing in `.github/` was touched by this change
      (`git diff --name-only b7c90afc..HEAD -- .github/` is empty) and the immediately preceding
      commit's run started normally, so it reads as a GitHub-side transient. `gh run rerun` was
      issued and sat in `queued` with no jobs.
- [ ] 6.5 **Linux `gate:e2e` discharged instead by the run on the next `dev` HEAD that CONTAINS
      this change** — which the rule allows explicitly ("a later `dev` HEAD that contains the
      change is fine").
      Run URL: _pending_ · `E2E (Playwright)` confirmed RAN (minutes, not 0 s): _pending_
