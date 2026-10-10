# Tasks — a pass timing set while stopped reaches the next take (B-322, B-323; `LOGO-LOOP-01`)

Lane: **FULL** for both parts — a take's wire (`B-322`) and what a page puts on air (`B-323`).

## 0. Reproduced first, by running

- [x] 0.1 Page: `take-tell-is-inert.test.ts` (`LOGO-LOOP-01` block) and `live-pass-timing.test.ts`, run against
      the unchanged controller: 5 red of 21. A resident tell carrying `passes: 'infinite'` to a settled page was
      dropped, and the next run closed after the stale count. The page also pins the designed half: with no
      timing told, the next run seats the last count it was given.
- [ ] 0.2 Bridge: `resident-take-timing.integration.test.ts` against the unchanged bridge, on the fake
      CasparCG: on-air count 1 → `stop` → off-air `Until stop` → take. The take's `CG UPDATE` carries no
      `timing` (the owner's state).

## 1. B-323 — a settled loop remembers its next timing (`@cg/template-runtime`, ships in CG Control)

- [x] 1.1 `PlayoutController.setRemainingPasses` / `setDelayMs`: a settled `loop-cycle` controller keeps the
      value and touches neither `cyclesLeft` nor `phase`. A non-cyclic controller still ignores both.
- [x] 1.2 Tests: the settled count and the settled gap at controller level (`live-pass-timing.test.ts`); the
      owner's sequence, an operator stop mid-run, and "remembered, re-arms nothing" at page level
      (`take-tell-is-inert.test.ts`). The template-runtime suite: 86 files, 1127 tests, green.
- [x] 1.3 Engine doc: `packages/template-runtime/README.md`.

## 2. B-322 — the resident take's `CG UPDATE` carries the recorded timing (CG Bridge)

- [ ] 2.1 One helper builds the control (`look`, `timing`, `take`) for `#sendAdd` and `#tellPageTake`; the
      timing member comes from `#wireTiming`, gated by `#admitsPassTiming`.
- [ ] 2.2 `CommandBuilder.updateTake` takes that control and keeps its key order (`take`, `look`, `timing`).
- [ ] 2.3 Wire tests: the resident route carries `timing`, one `CG PLAY`, no ADD; the `out` route re-ADDs with
      `timing`; no override → no member; a template that does not admit it → no member; an off-air set sends
      nothing.
- [ ] 2.4 Existing pins updated deliberately: `template-completion-stop.integration.test.ts` (the tell carries
      `__cg` only — timing is a control member, not a field) and `take-tell-is-inert.test.ts`'s header.
- [ ] 2.5 Stale comments reconciled: "the ONE route into air that carries no payload", "a take after a `stop`"
      called a re-ADD, "the next take carries it (`#sendAdd`)", and `DELTA A3` "unfixed and filed" (`DELTA B0`
      fixed it in the page).

## 3. Discharge

- [ ] 3.1 Full green gate on each part's commit.
- [ ] 3.2 A completed, green Linux `e2e` job that RAN, on a commit carrying both parts (run URL here).
- [ ] 3.3 The owner's check (H1) on his station, after CG Bridge AND CG Control are upgraded and the logo is
      re-imported.
