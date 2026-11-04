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
- [ ] 3.4 Run focused checks, strict OpenSpec validation and the full repository gate.

## 4. Remaining parity debt — integrated-source audit, 2026-11-04

The implementation checks above are retained as the owner's work-in-progress record; they do not
prove the superseding D-186 contract is complete. Read-only review of the integrated source still
finds visible Follow Lottie enabling `observeFreezeAtHoldEntry` through `noteFollowObserver`, the
controller reporting `holdEntry()` for that path, and Lottie's frozen clip position using `introEnd`.
Follow Video already derives its Freeze target from Outro start. This mismatch is not changed by
the gallery, stopped-countdown Canvas or Hold-marker color work.

- [ ] 4.1 Complete Follow Lottie/native/Video parity at Outro start, including root cursor telemetry.
- [ ] 4.2 Reconcile the parity assertions with the superseding contract and obtain focused runtime,
      Canvas/Preview browser, final-gate and carrying-commit Linux evidence before closing D-186.
