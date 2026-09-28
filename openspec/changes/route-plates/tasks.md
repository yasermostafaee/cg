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
