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
- [x] 1.6 CI at `d2920842`: https://github.com/yasermostafaee/cg/actions/runs/36244252292 — every job RAN, `e2e` success; Desktop
      https://github.com/yasermostafaee/cg/actions/runs/36244252261.

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
- [x] 2.6 CI at `85f39125`: https://github.com/yasermostafaee/cg/actions/runs/36247677294 — every job RAN, `e2e` success; Desktop
      https://github.com/yasermostafaee/cg/actions/runs/36247677409.

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
- [x] 3.5 CI at `c22845e3`: https://github.com/yasermostafaee/cg/actions/runs/36248396193 — every job RAN, `e2e` success; Desktop
      https://github.com/yasermostafaee/cg/actions/runs/36248396177.

## 4. A — one mapping (`B-277`)

- [x] 4.1 `amcpRefusal.ts`: the DeckLink line on 403 or 404 of a `DECKLINK` play; the file line on a
      404 of a media or stream play; the graphic line on a 404 of `CG ADD`; one generic line per
      code otherwise; never "AMCP" or the number. `errorCodeMessage` routes every `amcp-NNN` through it.
- [x] 4.2 Tests: `amcpRefusal.test.ts` (DeckLink 403 and 404 → one line; control: 404 on a file → the
      file line; a stream is a file line and a route is not; every code 400–503 with and without a
      command never says "AMCP" or its number; control: non-reply codes are not the mapping's);
      `errorCodeMessage.test.ts` and `rowState.errorReason.test.ts` re-pinned to the words.
- [x] 4.3 CI at `65a863d8`: https://github.com/yasermostafaee/cg/actions/runs/36249527939 — every job RAN, `e2e` success; Desktop
      https://github.com/yasermostafaee/cg/actions/runs/36249527953.

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
- [x] 5.6 CI at `5f594ed2` (carries B, `4ff40c5c`): https://github.com/yasermostafaee/cg/actions/runs/36252793158 — every job RAN, `e2e`
      success; Desktop https://github.com/yasermostafaee/cg/actions/runs/36252793177.

## 6. C — the Inspector never claims unconfirmed air (`B-279`)

- [x] 6.1 `claimsAir` (the row's own ON AIR mark) beside `isOnAir`; `LooksBindingsSection`'s badge and
      its divergence notes ask it.
- [x] 6.2 Tests: `lookBindings.dom.test.ts` (a refused take, unconfirmed, unverified and a take in
      flight are not `ON AIR NOW` — red first 4/4 against the old badge; control: an acknowledged
      take is); e2e `look-inputs.spec.ts` (a refused take does not claim air for its look; control: a
      take that lands does).
- [x] 6.3 CI at `b6ac0c47`: https://github.com/yasermostafaee/cg/actions/runs/36253740906 — every job RAN, `e2e` success; Desktop
      https://github.com/yasermostafaee/cg/actions/runs/36253740912.

## 7. E — CI actions on Node 24 (`P-055`)

- [x] 7.1 `checkout`@v7, `setup-node`@v7, `upload-artifact`@v7, `download-artifact`@v8, `pnpm/action-setup`@v6,
      `cache` and `cache/restore`@v6, `paths-filter`@v4 — in `pr.yml`, `desktop.yml` and `b078-soak.yml`
      (31 references); each confirmed `node24` from its own `action.yml` at the release tag.
- [x] 7.2 No Node 20 warning in the next runs, read from each job's annotations: `76bc9628`'s own
      https://github.com/yasermostafaee/cg/actions/runs/36254145850 (its `e2e` SKIPPED — a workflow-only diff), and `f9c9b816`'s
      https://github.com/yasermostafaee/cg/actions/runs/36257436440, whose `e2e` RAN and passed — the annotations there are the lint warnings
      and the runner-image notice, nothing about Node 20.

## 8. F — drag and drop in the installed apps (`B-280`)

- [x] 8.1 `"dragDropEnabled": false` on the `main` window of both apps (`tauri.conf.json`).
- [x] 8.2 Tests: `tauriWindows.test.ts` in each app — every window declares it; control: the same check
      fails for a window without the key; planted red: the runtime config without the key fails it
      (`expected [ 'main' ] to deeply equal []`). `turbo.json` `test` inputs hash the config.
- [x] 8.4 CI at `ef254448`: https://github.com/yasermostafaee/cg/actions/runs/36254981826 — every job RAN, `e2e` success; Desktop
      https://github.com/yasermostafaee/cg/actions/runs/36254981823.
- [ ] 8.3 The owner drags an asset onto the canvas, and a file from Explorer, in the new installed apps.

## 9. G — the name once, with the Apasai logo (`B-281`)

- [x] 9.1 CG Control's native menu removed; Quit = the close button, Reload = F5, Open bridge log =
      the audit log's `Open log folder` (`open_bridge_log`, `allow-open-bridge-log`, the bridge contract).
- [x] 9.2 Titles `APASAI CG CONTROL` / `APASAI CG DESIGNER`: both windows, both pages, the starting page,
      the Designer's empty-project tab title.
- [x] 9.3 The Control header's brand and the Designer landing's brand removed.
- [x] 9.4 Icons from `brand/apasai-icon.svg` (the logo on a white square) via `tauri icon`; the favicon.
- [x] 9.5 Tests: `tauriWindows.test.ts` (titles; control: `productName` and `identifier` unchanged),
      `appTitle.test.ts` (both pages), `monitorsDefault.dom.test.ts` (no brand; control: the channel
      strip), `starter-landing.spec.ts` (no brand, the tab title; control: the toolbar),
      `auditPanel.logFolder.dom.test.ts` (control: absent in a browser),
      `contextMenuSuppression.dom.test.ts` retargeted to the header's spacer; the installer smoke reads
      both title bars. `turbo.json` `test` inputs widened.
- [x] 9.7 CI at `f9c9b816`: https://github.com/yasermostafaee/cg/actions/runs/36257436440 — every job RAN, `e2e` success; Desktop
      https://github.com/yasermostafaee/cg/actions/runs/36257436445 (the installer smoke read both new title bars).
- [ ] 9.6 The owner sees one name, the Apasai logo in the title bar and taskbar, and no menu bar.

## 10. I — five rows per band for a new bank (`R-070`)

- [x] 10.1 `newChannelBank` from the occupancy read; the untick fallback; first-run and Change
      channel… use it; `firstRunBank` is its unknown case.
- [x] 10.2 Tests: `firstRunStation.test.ts` (five and five from an empty read; control: an occupied
      row stays shown; unknown shows every row; the fallback on `untick-unknown`; control: any other
      refusal is not retried; Change channel… reads only the added channel and keeps the other's bank);
      `stationSetupChannelScope.dom.test.ts` re-pinned (the added channel read empty gets five and five);
      bridge `one-channel-station` (a channel the tap reads takes the five-row bank live; control: with
      no server it is refused `untick-unknown` and every row shown is accepted); e2e `first-run.spec.ts`
      (two channels with OSC, five and five each, row 90 kept by its producer, 1920 × 1080 without a
      scroll; control: the no-OSC first-run shows every row) — the e2e needs TCP 5250 and UDP 6250,
      which a dev station held here, so it is CI's.
- [x] 10.3 CI RED at `b1fb8d00`, https://github.com/yasermostafaee/cg/actions/runs/36258166170: the new first-run test never closed the dialog
      — it probed for its second press with `isVisible({ timeout })`, which does not wait, met
      "Setting up…", and left the on-air warning for 2-90 waiting for "Use these channels anyway".
      Fixed in `378f1052` (the test waits for the warning and presses "anyway"; the product was not at
      fault), reproduced and verified locally first on 127.0.0.2 in an uncommitted copy. Green there:
      https://github.com/yasermostafaee/cg/actions/runs/36260734471 — `e2e` RAN, `first-run.spec.ts:516` passed; Desktop https://github.com/yasermostafaee/cg/actions/runs/36260734359.
- [x] 10.4 An existing saved bank is unchanged after an upgrade: `default-bank-boot` boots a bank saved
      with every row shown — the pre-I first-run bank, 30 rows — and reads it back as written.
- [x] 10.5 `eac4e7c0`: first-run's Check-rerun case no longer dials this machine's 127.0.0.1:5250 (a
      dev station's); https://github.com/yasermostafaee/cg/actions/runs/36261324201 — `e2e` RAN and passed; Desktop https://github.com/yasermostafaee/cg/actions/runs/36261324191.

## 11. K — silence controls live only when there is something to silence (`B-282`)

- [x] 11.1 `ledgerChannels` (shared) — the bridge's `liveLedgerChannels` and `silenceHasTarget` ask it.
- [x] 11.2 Both controls disabled and neutral with nothing in scope; the chip's neutral rule.
- [x] 11.3 Tests: `silenceHasTarget.test.ts` (no plate anywhere → no scope live; control: one plate on
      channel 2 → every channel and channel 2 live, channel 1 not; before arrival → live); `panicScope`
      (disabled and neutral with an empty ledger; the existing cases seeded with a plate); e2e
      `silence-controls.spec.ts` (amber and live with the seeded plates; after CLEAR disabled, neutral
      by computed ground, the same height, the bridge's words — red first without the CSS rule);
      `fillBridgeStub` answers an empty ledger.
- [x] 11.4 CI at `44a4e625`, https://github.com/yasermostafaee/cg/actions/runs/36259622599: `e2e` RAN; red only on I's first-run test (10.3),
      `silence-controls.spec.ts` passed. Discharged at `378f1052`, which carries it: https://github.com/yasermostafaee/cg/actions/runs/36260734471
      — `silence-controls.spec.ts:31` passed.

## 12. L — another system's layers: below the bands normal, inside them dismissible (`B-283`)

- [x] 12.1 `isInCgBands` (`@cg/shared-ipc`) and `foreignNotice.ts` — the one rule the strips and the
      mark read; `isOrphanedGraphic` moved there.
- [x] 12.2 Strips inside the bands only, each dismissible (`NoticeDismiss`); a dismissal per channel
      and strip in this browser; the mark follows the strips; the Station layers note scoped.
- [x] 12.3 Mock: the seed straddles the bands (1-5 and 1-90 `ffmpeg`, 1-60 `html`);
      `CG_TEST_ORPHAN_APPEARS` (`CG_E2E` only) lets a spec make a producer appear.
- [x] 12.4 Tests: `orphanLayersBanner.dom.test.ts` (layer 5 — video or html — no notice, no mark;
      control: layer 90 and 60 give both; a dismissal survives a reload; a new layer or a different
      producer returns it, a layer leaving or the same set again does not; the mark follows the
      strips; storage denied → the page only; fixtures moved inside the bands; "no Clear control"
      in place of "no button" — red first: 5 failed against the previous banner);
      `channelSwitch.dom.test.ts` fixture moved to 2-65; e2e `orphan-layers.spec.ts` (layer 5 listed
      on Station layers, no notice, no mark; layer 90's notice and mark; both strips dismissed; a
      reload keeps them; layer 91 appearing brings the video strip and the mark back).
- [x] 12.5 CI at `59a1ff4b`: https://github.com/yasermostafaee/cg/actions/runs/36262765138 — every job RAN, `e2e` success; Desktop
      https://github.com/yasermostafaee/cg/actions/runs/36262765118. Again at `3cec412d` (carries it): https://github.com/yasermostafaee/cg/actions/runs/36264378884 —
      `orphan-layers.spec.ts:20` and `:76` passed.

## 13. J — one splash, not two (`B-284`)

- [x] 13.1 Established what each app shows from launch to ready (design §15).
- [x] 13.2 `compose.mjs` (+ types); `stage-control.mjs` composes `starting-dist/` from the built console;
      `frontendDist` names it; the old starting page deleted; `start.js` / `start.css` speak inside
      the splash; `starting-dist` gitignored, lint-ignored and out of turbo's `lint` inputs; `typecheck`
      inputs hash `src-tauri/starting/**`, which a test now imports.
- [x] 13.3 Inside CG Control the console's splash continues the starting page (`data-continued`).
- [x] 13.4 Both windows' `backgroundColor` is their splash's ground.
- [x] 13.5 Tests: `startingPage.test.ts` (the console's splash CSS and markup in the starting page byte
      for byte, read independently of the composer; its title; no inline script, no clock; the build
      stamp carried; control: the console keeps its splash and clock; the shell loads the composed
      page — which staging writes, and without which the desktop job cannot build); `startingPage.dom.test.ts` (`STARTING BRIDGE` in the phase slot;
      a failure inside the splash with its sentence, port holders and log, the progress hidden;
      replayed twice, shown once; control: no failure before one); `splash.dom.test.ts` (continued
      in the shell's window, clock kept; control: not in a browser); `tauriWindows.test.ts` in both
      apps (the window's background is the splash's ground); e2e `splash.spec.ts` (in the shell's
      window every entrance is already over — duration 0 s, opacity 1; control: in a browser the
      wordmark's entrance is 1 s). Looked at in Chrome: the composed page, waiting and failed.
- [ ] 13.6 The owner launches the new CG Control and CG Designer: one splash, no white frame.
- [x] 13.7 CI at `3cec412d`: https://github.com/yasermostafaee/cg/actions/runs/36264378884 — every job RAN, `e2e` success, both
      `splash.spec.ts` J cases passed; Desktop https://github.com/yasermostafaee/cg/actions/runs/36264378891 — staging wrote
      `starting-dist`, `tauri build` took it, and the smoke read "APASAI CG CONTROL" off the new window.

## 14. H — the dev station's PROGRAM monitor, and `localhost` (`B-285`)

- [x] 14.1 Established where the frames stopped (design §16): not the proxy, not the listener, not
      the relay — the picture's `<img>` had no `src` in a development build.
- [x] 14.2 `ProgramPicture`: the layout effect sets `src` on every mount and removes it on every
      unmount.
- [x] 14.3 `CG_CONSOLE_HOST` from the dev station (`viteEnv`); the Vite config's `cg-console-host`
      middleware sends `localhost` to `127.0.0.1`, port, path and query kept. `turbo.json`: `test`
      inputs hash `vite.config.*`, which `vite-config.test.ts` imports.
- [x] 14.4 Tests: e2e `dev-station.spec.ts` through a real Vite dev server with the runtime's config
      (channel 2's return arrives and is still live 3 s later, the relay logging its viewer; control:
      the feed stopped reads "No return signal" — red first: `none` before the fix, the `<img>`
      without `src`, no `/pgm/` request made; a `localhost` page lands on `127.0.0.1` through a 307;
      control: `127.0.0.1` served directly); `programPicture.dom.test.ts` (the URL survives StrictMode
      — red first against the previous panel; control: a production-shaped mount; the unmount still
      aborts; no URL, no picture); `vite-config.test.ts` (the redirect's rule, control: the one host
      and a LAN address are served where they are; present only with `CG_CONSOLE_HOST`);
      `station-plan.test.ts` (`viteEnv`).
- [ ] 14.5 The owner opens `pnpm dev:station --fake` and `pnpm dev:station`: the PROGRAM picture moves,
      and `localhost:5174` lands on `127.0.0.1:5174`.
- [x] 14.6 CI at `97973e95`: https://github.com/yasermostafaee/cg/actions/runs/36265980234 — every job RAN, `e2e` success: `dev-station.spec.ts:109` and `:135` passed, the relay reading 127.0.0.2:9251 on Linux; Desktop https://github.com/yasermostafaee/cg/actions/runs/36265980225.
