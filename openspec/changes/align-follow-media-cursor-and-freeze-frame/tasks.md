# Tasks — align-follow-media-cursor-and-freeze-frame

## 1. Contract

- [x] 1.1 Keep B-377/B-378/B-379 and D-186; do not allocate a replacement id for the superseding
      owner decision.
- [x] 1.2 Define one composition Freeze anchor at Out point for native and Follow media.
- [x] 1.3 Remove the visible-Follow Content-start exception and the authored Video Freeze frame.
- [x] 1.4 Define forward Outro continuation and continuous manual scrub semantics.

## 2. Implementation

- [x] 2.1 Park root Freeze telemetry at composition Out point for every element kind while
      preserving Loop-middle reporting.
- [x] 2.2 Remove the Video Freeze-frame authoring field and make legacy serialized values inert.
- [x] 2.3 Derive Follow Video's held media position from composition Out point.
- [x] 2.4 Continue automatic/timed/content-driven Outro forward from Out point without a wrap or
      element-specific jump; keep operator Stop immediate.
- [x] 2.5 Preserve continuous manual timeline scrub independently of lifecycle Freeze/Loop policy.

## 3. Verification

- [x] 3.1 Update schema/Inspector tests to prove no Video Freeze-frame control or effective override
      remains.
- [x] 3.2 Add deterministic runtime coverage for Shape, Lottie and Follow Video parity at Out point.
- [x] 3.3 Add Canvas/Preview browser coverage for parked Freeze, forward Outro and continuous scrub.
- [x] 3.4 Run focused checks, strict OpenSpec validation and the full repository gate. The separate
      parity correction's gate evidence is recorded under 5.4; carrying-commit Linux remains open.

## 4. Remaining parity debt — integrated-source audit, 2026-11-04

The implementation checks above are retained as the owner's work-in-progress record; they do not
prove the superseding D-186 contract is complete. The initial read-only integrated-source audit
found visible Follow Lottie enabling `observeFreezeAtHoldEntry` through `noteFollowObserver`, the
controller reporting `holdEntry()` for that path, and Lottie's frozen clip position using `introEnd`.
Follow Video already derived its Freeze target from Outro start. The separate correction below
addresses this mismatch; the gallery, stopped-countdown Canvas and Hold-marker work did not.

- [x] 4.1 Complete Follow Lottie/native/Video parity at Outro start, including root cursor telemetry.
- [ ] 4.2 Reconcile the parity assertions with the superseding contract and obtain focused runtime,
      Canvas/Preview browser, final-gate and carrying-commit Linux evidence before closing D-186.

## 5. Bounded parity follow-up after integration push

The follow-up starts from verified remote `877da2c4` in the isolated integration checkout. It changes
only Follow-Lottie runtime mapping, shared root telemetry, the effective Inspector readout and their
tests/documentation. The owner's original checkout, supplied projects, native packages, installer
configuration and fake-station services remain untouched. No persisted schema field is added.

- [x] 5.1 Reproduce the superseded behavior before correcting it: static scrub returns source 50
      instead of 65, the held poster uses source 50 instead of 225, and root telemetry reports
      Hold start 10 instead of Out point 40.
- [x] 5.2 Complete the isolated correction and deterministic regression coverage, preserving
      manual-media semantics, actual Loop playback and forward Outro gating. Focused runtime:
      **192/192 across nine files**; Inspector: **26/26 across two files**. Runtime and both Designer
      TypeScript realms passed, as did scoped lint and formatting. Independent read-only review
      found one degenerate-Loop tooltip mismatch; it was corrected and regression-tested before
      the final browser build.
- [x] 5.3 Verify actual animated SVG pictures and cursor behavior in fresh Canvas/Preview browser
      runs, including manual scrub, Freeze, Pause/Resume, operator Stop and timed exit. A fresh
      14-package Designer dependency build preceded the four-suite Windows browser batch:
      `media-timing-authoring`, `canvas-lifecycle-playback`, `lottie-auto-exit` and
      `lottie-entrance-settle`: **13/13 passed in 50.6 s**, with one browser worker. The new cases
      measure rendered SVG geometry as well as the root cursor. An initial run used a stale
      generated runtime bundle and exposed the old behavior; rebuilding the dependency closure
      corrected that setup. A subsequent fixture mistakenly queried a nonexistent Canvas Stop;
      it now uses Canvas Pause/scrub and verifies operator Stop in the dedicated Preview. No
      production assertion was weakened. Windows evidence does not discharge Linux E2E.
- [ ] 5.4 Run the full gate, commit and push separately; read carrying-commit CI without claiming
      Linux evidence until the actual E2E job completes green.

Pre-commit full gate: `gate-20261104T195708Z-15620.log` ends at
`2026-11-04T20:09:41.508Z` with **exit 0, 753.5 seconds, 103/103 uncached tasks**.
Template-runtime **1352**, Designer **1975**, CG Control **2532** and Bridge **1961** tests pass.
Formatting, the 4609-text-file control-byte scan and all **141** strict OpenSpec items pass.
The correction is committed as `1b76faf0`, pushed to `dev`, and the remote full SHA is independently
verified. Its separate pre-push gate `gate-20261104T201211Z-17132.log` also ends with exit 0 in
758.8 seconds, with 103/103 uncached tasks and all 141 strict OpenSpec items passing. The live
Designer landing displays this revision. [Carrying-commit CI](https://github.com/yasermostafaee/cg/actions/runs/41906376920)
has completed with a successful non-E2E validation job but failed actual Linux E2E. Desktop is
deliberately skipped. Both carrying runs' whole-suite failures and corrected-tree local evidence
are recorded under `../reconcile-current-designer-gallery/tasks.md` sections 4–5; no Linux
discharge is claimed for either change.
