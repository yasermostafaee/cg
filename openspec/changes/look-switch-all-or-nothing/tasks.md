# Tasks — look-switch-all-or-nothing (`LOOK-SWITCH-01` v2 §0–§3, v3 §1–§4)

Lane: FULL (the path to air, the wire). v2 ran overnight 2026-09-27 up to §3; v3 built §1 and measured it.

## §0 Establish (no code changed — v2)

- [x] 0.1 Today's AMCP order for a 1 → 2 switch, measured on the fake; where `B-273`'s frames come from
      (`design.md` §0.1).
- [x] 0.2 Which of the new look's plates are already seated; what a pre-seat must seat (§0.2).
- [x] 0.3 The hide/reveal pattern against the code and the stock 2.5.0 source; how the reveal joins the
      `B-174` window; today's held mechanism against fact 4; the producer-start term (§0.3).
- [x] 0.4 Every `DEFER`, `MIXER <ch> COMMIT` and `MIXER CLEAR` site; what a reconnect sends (§0.4).
- [x] 0.5 What the fake proves, what needs real CasparCG; the command (§0.5, §3).

## Pinned (zero wire change — v2)

- [x] P.1 No channel-wide `MIXER <ch> CLEAR` anywhere, and no AMCP `BEGIN` batch —
      `tools/caspar-bridge/tests/mixer-scope-pins.test.ts`, each with its control, red first under a planted
      builder for each.

## §1 Build (v3, `design.md` §1)

- [x] 1.1 The pre-seat step (`#preSeatSwitch` → the seat step `#seatPlates`: hide + mute + fit as `DEFER`, one
      `COMMIT`, awaited; `PLAY`, awaited), before the page is told; `ROUTE-PLATES-01`'s one named place is
      `#startSeatProducer`.
- [x] 1.2 On a refusal: undo only what the step seated, through `mayClearAfterRefusal`; no page `UPDATE`, no
      further `COMMIT`; the row keeps its old look and carries the line (`takeRefusal`, `refusalOnRow`).
- [x] 1.3 On success: the reveal (`OPACITY 1`, the volume as today's code computes it) inside the switch's one
      `COMMIT`; a switch that lands withdraws the line.
- [x] 1.4 Hide before `PLAY` on every seating path onto a layer nothing of ours is on — take, switch, swap,
      restore (an in-place replace is never hidden: `design.md` §1 choice 1).
- [x] 1.5 After an AMCP reconnect, the first `DEFER` set carries the full plate mixer state of layers 50 and up
      only (`#resendLiveMixerState`); the backup-alone re-send is filed (choice 2).
- [x] 1.6 `tools/skew-harness`: the switch window starts at the page `CG UPDATE` (`switchWindow`).
- [x] 1.7 A plate layer's `MIXER CLEAR` only once its `CLEAR` landed, at the three sites §0.4 found
      (`#resetPlateMixerIfCleared`).
- [x] 1.8 The console: no banner for a refusal the row carries (`lookSwitchBanner`); the IPC reply's
      `refusalOnRow` (`StackSetActiveLookChannel`); the offline mock's one-shot seam
      (`CG_E2E_REFUSE_NEXT_SWITCH`).

## §2 Tests (v3) — each absence with its positive control

- [x] 2.1 `tools/caspar-bridge/tests/look-switch-all-or-nothing.integration.test.ts` (17; 15 before the fix
      cycle added 3.4's two): refused 1 → 2,
      variant 1 → 3, the accepted control, the line withdrawn; held plates; order; hidden before `PLAY` on take,
      switch and swap, and an in-place replace never hidden; the reveal volume; the reconnect re-send and
      nothing below 50; the backup's journal replay; the `MIXER CLEAR` gate. Red first: 11 of 15 fail on the
      `HEAD` runtime; the 4 that pass are the controls and pins of properties that already held.
- [x] 2.2 Updated for the new wire, each with its reason: `take-all-or-nothing` (the recorded success wire,
      plate 1 refused, the "IS cleared" control now refuses the reveal), `live-seating` (the order),
      `live-look-reconcile` (a refused switch never tells the page; `B-199`'s staged count 18 → 36).
- [x] 2.3 `tools/amcp-mock/tests/live-producers.test.ts` — `OPACITY` applied, staged, refused out of range,
      reset by `MIXER CLEAR`; the "unimplemented sub-verb" guard moved to `ROTATION`.
- [x] 2.4 `tools/skew-harness/tests/wire-tap.test.ts` — the switch window, with its controls.
- [x] 2.5 `apps/runtime/tests/lookPicker.dom.test.ts` (`lookSwitchBanner`) and
      `apps/runtime/tests/e2e/look-switch-refusal-line.spec.ts` (red first: fails on `[data-refusal]` under the
      old row handler).
- [x] 2.6 v2's pins (`mixer-scope-pins.test.ts`) stay green.

## §3 Measurement (v3 — CC, on this machine's CasparCG at `127.0.0.1:5250`)

- [x] 3.0 Station check and baseline (`design.md` §3 v3).
- [x] 3.1 After §1: the first measurement FAILED on term (b) (3 runs of 10: 2, 2, 4 fields). The one
      fix-and-measure cycle: the preroll (`PRE_SEAT_PREROLL_HOLDS`) and the mid-pre-seat re-ask. After it, PASSED:
      `ghab` full → boxes and boxes → full, `ghab3` control — `k` = 0 in 30 of 30 runs (the fresh seats
      included), BLACK and MISPLACED 0 %, term (b) 0 in 30 of 30, CONTROL ≈ 0.
- [x] 3.2 The refusal run: SKIPPED — the harness needs a code change to name a missing clip (its sources are a
      catalog built in `run.ts`, not a fixture); the refusal is proven on the fake.
- [x] 3.3 `INFO 1` byte-identical to §0.2's, after `ADD 1 SCREEN` (the harness's own restore) put back the screen
      consumer the first baseline's `SET MODE` lost while the workstation was locked.
- [x] 3.4 The fix cycle's tests: the preroll (three holds between the answered `PLAY` and the page tell; control:
      a held-plate switch tells the page first) and the row taken out mid-pre-seat (red first without the
      re-ask).

## Gate and discharge

- [x] Z.1 v2: `pnpm gate` green; `pnpm openspec validate --all --strict` (the pre-push gate at `89302de8`).
- [x] Z.2 v2 CI run URL, jobs confirmed RAN — `89302de8`: https://github.com/yasermostafaee/cg/actions/runs/36286015793 (Lint • Typecheck • Test • Build and E2E, both run, success); installers https://github.com/yasermostafaee/cg/actions/runs/36286015857 (success).
- [x] Z.3 v3: `pnpm gate` green; `pnpm openspec validate --all --strict` (before the measurement, and the pre-push gate at `b1fc75ee`: 96/96 tasks, 0 cached, 88/88 valid).
- [x] Z.4 v3 CI at `b1fc75ee`, jobs confirmed RAN: https://github.com/yasermostafaee/cg/actions/runs/36308540770 (Lint • Typecheck • Test • Build success; E2E (Playwright) success with its `E2E` step run); installers https://github.com/yasermostafaee/cg/actions/runs/36308540747 (Installers (Windows) and Installer smoke (clean Windows), both success).
