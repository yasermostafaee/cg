# Tasks — look-switch-all-or-nothing (`LOOK-SWITCH-01` v2)

Lane: FULL (the path to air, the wire). Run overnight 2026-09-27 up to §3 only.

## §0 Establish (no code changed)

- [x] 0.1 Today's AMCP order for a 1 → 2 switch, measured on the fake; where `B-273`'s frames come from
      (`design.md` §0.1).
- [x] 0.2 Which of the new look's plates are already seated; what a pre-seat must seat (§0.2).
- [x] 0.3 The hide/reveal pattern against the code and the stock 2.5.0 source; how the reveal joins the
      `B-174` window; today's held mechanism against fact 4; the producer-start term (§0.3).
- [x] 0.4 Every `DEFER`, `MIXER <ch> COMMIT` and `MIXER CLEAR` site; what a reconnect sends (§0.4).
- [x] 0.5 What the fake proves, what needs real CasparCG; the command (§0.5, §3).

## Pinned now (zero wire change)

- [x] P.1 No channel-wide `MIXER <ch> CLEAR` anywhere, and no AMCP `BEGIN` batch —
      `tools/caspar-bridge/tests/mixer-scope-pins.test.ts`, each with its control, red first under a planted
      builder for each.

## §1 Build — HELD for the owner's measurement (`design.md` §3: not independent)

- [ ] 1.1 The pre-seat step in `setActiveLook` (hide + mute + fill as `DEFER`, one `COMMIT`, wait; `PLAY`,
      wait), before the page is told; one named place for `ROUTE-PLATES-01`'s `LOADBG` → `PLAY`.
- [ ] 1.2 On a refusal: undo only what the step seated, through `mayClearAfterRefusal`; no page `UPDATE`, no
      switch `COMMIT`; the row keeps its old look with the A/B line.
- [ ] 1.3 On success: the reveal (`OPACITY 1 DEFER`, volume intent) inside the switch's one `COMMIT`.
- [ ] 1.4 Hide before `PLAY` on every seating path: take, switch, swap, restore.
- [ ] 1.5 After an AMCP reconnect, the first `DEFER` set carries the full mixer state of layers 50–99 only.
- [ ] 1.6 `tools/skew-harness`: the switch window starts at the page `CG UPDATE`, so a pre-seat `PLAY` does not
      exclude the run.

## §2 Tests for §1 (with §1)

- [ ] 2.1 Refused 1 → 2: no page `UPDATE`, no switch `COMMIT`, plate 1 untouched, the rule applied to plate 2,
      the row on its old look with the line; control: every plate accepted completes.
- [ ] 2.2 Held plates: no new `PLAY`. 2.3 The old look's plates receive nothing on a refusal.
- [ ] 2.4 Every pre-seat `PLAY` reply before the page `UPDATE`. 2.5 `OPACITY 0` + `VOLUME 0` committed before
      every `PLAY`; control: the page layer's take order unchanged.
- [ ] 2.6 Reconnect: the first `COMMIT` carries our full layer state and nothing for 1–49; control: a normal
      switch sends only its deltas.

## §3 Measurement (the owner)

- [ ] 3.1 The owner runs `design.md` §3's command on his dev station; `k` = 0 in every run including the fresh
      seats, BLACK and MISPLACED 0 %, term (b) 0. Then ship §1, then close `B-273`.

## Gate and discharge

- [x] Z.1 `pnpm gate` green; `pnpm openspec validate --all --strict` (the pre-push gate at `89302de8`).
- [x] Z.2 CI run URL, jobs confirmed RAN — `89302de8`: https://github.com/yasermostafaee/cg/actions/runs/36286015793 (Lint • Typecheck • Test • Build and E2E, both run, success); installers https://github.com/yasermostafaee/cg/actions/runs/36286015857 (success).
