# Tasks — field fixes from 2026-09-26 (`FIELD-FIXES-01` v6, `FIELD-FIXES-01-A`)

## 0. Established (no code)

- [x] 0.1 §0's five answers, from the installed app's logs and a mock replay of the station's own
      state (`design.md` §0); the owner accepted them in `FIELD-FIXES-01-A`.
- [x] 0.2 The clean-up-after-refusal sites, with anchors (`design.md` §2).
- [x] 0.3 The look switch on a refused plate (`design.md` §3) — filed as `B-273`, not fixed.

## 1. Decision 1 and the Rule (`B-271`, `B-272`)

- [x] 1.1 `refusal-cleanup.ts` — `mayClearAfterRefusal`, `outcomeOf`; `#clearAfterRefusal` is the
      one caller of both, and every clean-up site calls it.
- [x] 1.2 The take stops at the first refused plate, never plays the graphic, undoes only what it
      seated, and removes the graphic it added (`#removeUnplayedPage`); the graphic's own refused
      `CG PLAY` undoes the same way.
- [x] 1.3 `TakeRefusalSchema` / `StackItemState.takeRefusal`, recorded on refusal and published; the
      row reads ERROR while it stands; withdrawn by the next landed take, `out`, the bank clear and
      `remove`.
- [x] 1.4 `take-all-or-nothing.integration.test.ts` 9/9 — the success wire byte for byte (recorded at
      `459c3f64`), plate 1 refused, plate 2 refused after plate 1, the neighbour's layer untouched,
      the graphic's `CG PLAY` refused, the line withdrawn, the Rule's table, the R-048 swap and its
      control. Red first: 4/9 red against `459c3f64`'s runtime (plate 1, plate 2, `CG PLAY`,
      withdrawn); the success pin, both controls and the swap were green before and after.
- [x] 1.5 The whole bridge suite green: 141 files, 1188 tests.

## 2. Decision 2 and the 5 s (`B-274`, `B-275`)

- [x] 2.1 `#takeImpl` refuses `already-on-air` (`TAKE_ON_AIR_CODE`) on `#ownsLiveSeats`, before any
      mutation; `MockRuntime.take` refuses the same.
- [x] 2.2 `Reconciler.expireIntent`: an expired take is `takeOverdue` — keeps its evidence, reads
      `unconfirmed`, and its own late reply resolves it (`applyAck`); a newer intent supersedes it.
- [x] 2.3 The row's PLAY is disabled on `ownsLiveSeats` (`@cg/shared-schema`: `isOnAirStatus` or a
      seat in the published ledger — the bridge's `#ownsLiveSeats` and the mock's take call the same
      function), titled `takeOnAirReason(row)`; a bridge refusal is worded the same;
      `errorCodeMessage` carries the row-less form.
- [x] 2.4 Tests: `take-on-air-refusal.integration.test.ts` 2/2 (two consoles through the real bridge;
      the slow reply with the bound injected) — red first 2/2 against `d2920842`'s runtime and
      Reconciler; `reconciler-failed-take.test.ts` (overdue, late OK, late failure, no OSC,
      superseded, re-take); `takeOnAirGate.test.ts` 10/10; `layerRow.dom.test.ts`'s `unconfirmed`
      case reversed to the owner's rule; the six on-air re-takes rewritten (design §4).
- [x] 2.5 The seat half at the console: `takeOnAirGate.test.ts` "a row whose plates the ledger holds"
      (+ control: the same row with no seat is offered PLAY); the five runtime e2e specs that pressed
      PLAY on the seed's seated news row retargeted, and `fixed-layers` pins the refusal title with
      PLAY back after CLEAR as its control (design §4). Local (Windows, not a discharge): the
      whole runtime suite 261/261. `MockRuntime.test.ts`: the seated seed row's take is refused with
      nothing seated twice, and the two out-then-take cases wait for OUT to settle.

## 3. The AMCP log (`B-276`)

- [x] 3.1 `CommandQueue` says every settled exchange (`exchange`): the line, the reply header as sent,
      the round trip; a timeout, a disconnect or an abort by name; a late reply again, marked late.
- [x] 3.2 `amcp-log.ts`: one line per exchange, the take token redacted in both spellings, 5 MB then
      one previous file, fail-open. The runtime takes it as a construction-time SINK (not an emitter:
      `B-247`'s guard pushes every emitter to consoles); `createBridge` wires it from `amcpLogPath`.
- [x] 3.3 The CLI derives `<state-home>/logs/amcp.log` (`%APPDATA%\CG Control\logs\amcp.log` for the
      installed app); `--amcp-log-path` overrides; the dev station passes it beside its `bridge.log`.
- [x] 3.4 Tests: `amcp-log.integration.test.ts` 6/6 — the line, the redaction with its control, the cap
      and rotation, fail-open, a take through a real bridge, and the BUNDLED sidecar started as the
      desktop shell starts it writing `<state-home>/logs/amcp.log` with no exchange on its stderr
      (the control) — red first against HEAD's CLI: `no AMCP log at …\CG Control\logs\amcp.log`;
      `command-queue.test.ts` +4; `station-plan.test.ts` (the dev station's path, inside its state).

## 4. A — one mapping (`B-277`)

- [x] 4.1 `amcpRefusal.ts`: the DeckLink line on 403 or 404 of a `DECKLINK` play; the file line on a
      404 of a media or stream play; the graphic line on a 404 of `CG ADD`; one generic line per
      code otherwise; never "AMCP" or the number. `errorCodeMessage` routes every `amcp-NNN` through it.
- [x] 4.2 Tests: `amcpRefusal.test.ts` (DeckLink 403 and 404 → one line; control: 404 on a file → the
      file line; a stream is a file line and a route is not; every code 400–503 with and without a
      command never says "AMCP" or its number; control: non-reply codes are not the mapping's);
      `errorCodeMessage.test.ts` and `rowState.errorReason.test.ts` re-pinned to the words.

## 5. B — the refusal lives with the row (`B-278`)

- [x] 5.1 `takeRefusalLine` + `TakeRefusalText`: one line from `takeRefusal`, names isolated; on the row
      (template cell, `data-take-refusal`) and in the state cell's ERROR title; in the Inspector
      (`data-inspector-take-refusal`).
- [x] 5.2 `StackTakeChannel` answers `refusalOnRow` where the bridge recorded the refusal; the console
      raises no banner for it (`asyncResultMessage` → null, the controller settles idle).
- [x] 5.3 The strip marks the channel whose row carries a refusal (`takeRefusalChannels` in `App`).
- [x] 5.4 Mock parity: the refusal recorded, withdrawn by a take that lands and by OUT; the one-shot
      seam `CG_E2E_REFUSE_NEXT_TAKE`.
- [x] 5.5 Tests: `takeRefusalLine.test.ts` (the owner's line word for word; no source for the
      graphic's own command; no banner, idle, with its control; the strip's channels);
      `take-all-or-nothing` (`refusalOnRow` on both wire refusals; control: `already-on-air` has
      none); e2e `take-refusal-line.spec.ts` (the row and the Inspector say the line, no banner, no
      "AMCP"; the other channel shows only the mark, measured against a baseline; control: a take
      that lands clears the line and the mark).

## 6. C — the Inspector never claims unconfirmed air (`B-279`)

- [x] 6.1 `claimsAir` (the row's own ON AIR mark) beside `isOnAir`; `LooksBindingsSection`'s badge and
      its divergence notes ask it.
- [x] 6.2 Tests: `lookBindings.dom.test.ts` (a refused take, unconfirmed, unverified and a take in
      flight are not `ON AIR NOW` — red first 4/4 against the old badge; control: an acknowledged
      take is); e2e `look-inputs.spec.ts` (a refused take does not claim air for its look; control: a
      take that lands does).

## 7. E — CI actions on Node 24 (`P-055`)

- [x] 7.1 `checkout`@v7, `setup-node`@v7, `upload-artifact`@v7, `download-artifact`@v8, `pnpm/action-setup`@v6,
      `cache` and `cache/restore`@v6, `paths-filter`@v4 — in `pr.yml`, `desktop.yml` and `b078-soak.yml`
      (31 references); each confirmed `node24` from its own `action.yml` at the release tag.
- [ ] 7.2 The next CI run shows no Node 20 warning — its URL recorded here.

## 8. F — drag and drop in the installed apps (`B-280`)

- [x] 8.1 `"dragDropEnabled": false` on the `main` window of both apps (`tauri.conf.json`).
- [x] 8.2 Tests: `tauriWindows.test.ts` in each app — every window declares it; control: the same check
      fails for a window without the key; planted red: the runtime config without the key fails it
      (`expected [ 'main' ] to deeply equal []`). `turbo.json` `test` inputs hash the config.
- [ ] 8.3 The owner drags an asset onto the canvas, and a file from Explorer, in the new installed apps.
