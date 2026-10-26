# route-plates — tasks

## 0. Establish first (`design.md` §0)

- [x] 0.1 Every `MIXER … VOLUME` to a plate-band layer — eight plate sites, anchored
- [x] 0.2 The seating order on a take and a switch, and where a `LOADBG` → `PLAY` pair fits
- [x] 0.3 Nothing relies on `BEGIN…COMMIT`
- [x] 0.4 The three restore paths
- [x] 0.5 What reaches server B (and `SendOptions.target` read by nothing — `B-287`)
- [x] 0.6 Undeclared targets exist (`takeStrayOffAir`, the reconnect re-send): §1.E's removal part STOPS
- [x] 0.7 How a held plate is kept today
- [x] 0.8 The forbidden commands, and where each is reachable

## 1. Build

- [x] 1.A Rule 2 verified for routes on every seating path (take, switch, swap, restore) — no extension needed
- [x] 1.B Rule 4: `#startRouteProducer` in the seat step; the reveal's wait; the multi-box commits; the held
      route at `OPACITY 0`; the `loaded` refusal outcome
- [x] 1.C Rule 5: the epoch on a record (persisted, additive); the bounded D10 confirm at every door; the
      reconnect re-read; the waiting line; the seam's epoch refusal; the lossless 64-bit parse
- [x] 1.D Rule 1: `sourceShowableOn` in the plan and the picker; `source-not-showable` and its line
- [x] 1.E The send-seam guard (`amcp-guard.ts`); the stray door's one exemption; removal part stopped (§0.6)
- [x] 1.F C4: `mirror: false` (primary only, never journaled); primary-is-A; `backupUnmirrored` and its line
- [x] 1.G The gate removed, last — `routeInputGate`, `ROUTE_NOT_SUPPORTED_YET` and the picker tag
- [x] 1.H The fakes: the mock's `LOADBG`, bare `PLAY` and command log; the fake Playout's core restart and
      64-bit epoch literal

## 2. Tests

- [x] 2.1 `tools/caspar-bridge/tests/route-plates.integration.test.ts` — audio order, timing, multi-box, held,
      epoch (restart, empty core, API down, same epoch, seam), destination, the seam's guard, backup,
      `FIELD-FIXES-01-A`, the gate gone (red before 1.G, green after)
- [x] 2.2 `tests/amcp-guard.test.ts`; the `loaded` outcome in `take-all-or-nothing.integration.test.ts`
- [x] 2.3 The 64-bit epoch over HTTP (`playout-sources-http.integration.test.ts`) and in `@cg/shared-ipc`
- [x] 2.4 Console: `takeRefusalLine.test.ts`; the picker and Sources dom tests; e2e
      `apps/runtime/tests/e2e/route-plates-lines.spec.ts` (the three lines, row and Inspector)
- [x] 2.5 Superseded behaviour re-expressed, and named in the report: the gate's tests; `C-029`'s two
      consumer-`ADD` cases; the stored epoch as a string; the channel fence's foreign layer 20 → 90; the
      mock's bare `PLAY` answered as the core answers it
- [x] 2.6 Measured on a real core (the owner's CasparCG 2.5.0, channel 1, layers 90–92, `INFO 1` unchanged)

## 3. Docs

- [x] 3.1 PRD `C-045`; `C-044`'s gate bullet points to it; `B-287` filed
- [x] 3.2 ADR 0010 amended: the v1.3 paragraph (rules 1–6 with C1–C5, and where each is kept)
- [x] 3.3 `docs/integration/playout/README.md`: v1.3 accepted; `RouteInputs` stays off until we write

## 4. Gate and CI

- [x] 4.1 Prettier and `pnpm gate` (the push's pre-push gate: 96/96 tasks, 0 cached)
- [x] 4.1b `pnpm openspec validate --all --strict` — 90/90
- [x] 4.2 Pushed `cdc3c03b` (code `0221eafc`); both runs COMPLETED green with their jobs RUN:
  - PR — https://github.com/yasermostafaee/cg/actions/runs/36356560683 — `ci` success; `E2E (Playwright)`
    success, its `E2E` step ran: runtime 295 passed, designer 291 passed / 12 skipped
  - Desktop — https://github.com/yasermostafaee/cg/actions/runs/36356560698 — `Installers (Windows)` and
    `Installer smoke (clean Windows)` success
- [x] 4.3 Follow-up `829b7b42` — a reconnect keeps a held route hidden (the re-send's `OPACITY 0`), a test
      only; carried by the push after `cdc3c03b`

## 5. `FOLLOWUPS-01` — the owner's decisions (2026-09-28; `design.md`, last section)

- [x] 5.1 A — `C-029`'s consumer `ADD` retired (`--create-missing-consumers`, `#createMissingConsumer`, the
      `creation` record); `pgm-output-alarm`'s pending delta amended in place
- [x] 5.2 B — no console or IPC path asks for a `CLEAR` below 50: both clear doors' request schemas take
      50 and up; the Station layers tab offers no CLEAR below 50, nor counts it in CLEAR ALL
      (`low-layer-clear.integration.test.ts`, `stationLayersPanel.dom.test.ts`, `runtime-channels.test.ts`;
      each planted red, removed green)
- [x] 5.3 C — `SendOptions.target` deleted, `B-287` closed (the filing's "nothing passes it" corrected: three
      `INFO` reads did, wire byte-identical)
- [x] 5.4 D — recorded: the stray door's exemption stays; a moved holder's row waits until a re-take
- [x] 5.5 Gate and CI — `pnpm gate` 96/96, 0 cached, three times in a row on the final tree
      (`gate-20260928T100800Z-15948.log`, `…101521Z-18636.log`, `…102238Z-24812.log`); Linux CI on
      `8d48692e` (A `b1a6ce93`, C `4343fc5f`, B `8d48692e`): PR
      <https://github.com/yasermostafaee/cg/actions/runs/36405138989> — COMPLETED `success`, `ci` and
      `E2E (Playwright)` both RAN (runtime 298 passed; designer 291 passed, 12 skipped); Desktop
      <https://github.com/yasermostafaee/cg/actions/runs/36405139002> — both installer jobs RAN, `success`.
      `FOLLOWUPS-01`'s head `b5e681f4`: PR <https://github.com/yasermostafaee/cg/actions/runs/36410757836>
      and Desktop <https://github.com/yasermostafaee/cg/actions/runs/36410757798>, both `success`, every job
      RAN

## 6. Target Playout activation (owner field report, 2026-10-26)

- [x] 6.1 Diagnose the screenshots: multicast UDP, NDI and RTMP are D10's direct-safe inputs; the
      missing unicast RTP and SDI are exclusive inputs intentionally absent from a direct-only D10
- [x] 6.2 Verify CG `0.11.6` already contains route-input, playlist-output and loop-prevention support
- [x] 6.3 Write the target-side request and acceptance evidence in
      `docs/integration/playout/CG-CONTROL-REQUEST-ROUTE-INPUTS-PLAYLIST-2026-10-26.md`
- [x] 6.4 Identify the exact target and distinguish configuration from an old build: live target
      `192.168.21.112` serves Playout `2.12.0`; CG Bridge `0.12.0` reports CasparCG `up` and its
      Playout session `signed-in`; the owner's credential-free UI census shows five Playout inputs
      versus only the three direct-safe D10 rows and no route/playlist row, so `RouteInputs` is off,
      not unsupported. Evidence is recorded in the target-side request document
- [x] 6.5 On target `192.168.21.112`, during the owner-approved test-playback window, enable
      `InputHolder.Enabled`, accept the one required core restart (the UI reported 8 seconds), and
      then enable and save `CgControl.RouteInputs` without a second restart or a Playout upgrade.
      After the restart Playout `2.12.0` was ready; Bridge `0.12.0` reported CasparCG and AMCP `up`,
      OSC subscribed, channel 1 present, the Playout session signed-in, and no problems
- [x] 6.6a Verify catalogue propagation in CG Control: the CH 1 picker grew from `Inputs 3` to
      `Inputs 6` and now lists UDP, unicast RTP, SDI, NDI, RTMP and `خروجیِ پخش: آپاسای`. The
      playlist row is available/selectable; RTP, SDI and RTMP are visible but currently
      `Unavailable`, as explicitly reported by the Playout rather than filtered by CG
- [ ] 6.6b Capture a credential-scrubbed D10 answer proving the top-level `epoch`, RTP and SDI
      `route` producers with real `channel`/`layer` plus `compatibleChannels`, and a `pl-` route with
      `playlistOf`
- [x] 6.6c On the real test output, select the playlist route and verify the raw current Playlist
      picture, locked/muted zero audio, and no recursive CG feedback; stop the test row and restore
      the previous Plate 1 mapping afterward
- [ ] 6.6d With healthy RTP and SDI feeds, verify both can be selected and render on an allowed
      channel. The current target reports the RTP holder cycling through reopen/disconnected and
      the SDI holder no-signal; RTMP also cycles because its test hostname does not resolve
- [ ] 6.6e Restart the core while exercising a route and verify a stale epoch is never seated: the
      plate stays empty/waiting until a fresh D10 is read, and the Bridge recovers healthy
- [ ] 6.6f Correct the diagnostic source-kind label: today Station setup intentionally renders every
      `route` as `SDI`, so held RTP/RTMP and the Playlist route are mislabeled. CG can distinguish
      `playlistOf` and otherwise fall back to `Route`; exact original RTP/RTMP/SDI provenance needs
      an optional additive D10 field from the Playout
- [x] 6.6g Put every `playlistOf` row first inside every `SourcePicker` Inputs list, using a stable
      partition that preserves D10 order within the Playlist and ordinary groups; leave `None`, Media,
      unavailable/disabled and channel-compatibility behaviour unchanged. Update
      `sourcePicker.dom.test.ts` and add a Playwright assertion in `playlist-output.spec.ts`
- [x] 6.6h Record the owner's SourcePicker surface decision in the PRD, proposal, design and
      `runtime-playout-sources` delta: Inputs and Media opt into a token-only `raised` Popover variant
      (`--r-surface-raised`, `--r-border-strong`, `--r-shadow-menu`), with no scrim, geometry, source behaviour or
      keyboard change
- [x] 6.6i Implement that opt-in variant only on `SourcePicker`; prove in Chromium that its painted
      background differs from the host surface, its edge remains legible and its shadow is present, while the
      existing placement, modal and keyboard assertions stay green
