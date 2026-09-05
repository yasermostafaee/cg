# Tasks — the program-output alarm (C-029)

## 0. Premises verified (session `PGM-OUTPUT-ALARM-01`, 2026-09-04)

- [x] 0.1 Tip `f86fc137` == `origin/dev`; `pnpm install` up to date.
- [x] 0.2 The fixture holds on the plant: `INFO CONFIG` declares `<decklink><device>23487013</device>`,
      `INFO 1`'s `<output>` lists only `port_500` system-audio and `port_600` screen (read at the wire,
      `192.168.21.114:5250`, `2.5.0 69e8ad5 Stable`). Config NOT fixed.
- [x] 0.3 Corrections to the brief, recorded in `design.md`: the install path is the PLANT's
      (`192.168.21.114`), the dev host's 2.5.0 is `D:\programs\casparcg-server-v2.5.0-stable-windows`
      and has NO DeckLink drivers (every boot since 2026-08-24 logs "Decklink drivers not found.");
      `port_23487313` is `300 + 23487013`, the OLD card running; no repo record says the card "must be
      auto-detected" (the record says the opposite — Q2, "declared, never detected"); the
      full-width-banner decision traces only to `B-172`; `B-204`/`B-205` were already closed.

## 1. The wire (`@cg/shared-ipc`)

- [x] 1.1 `ServerHealth.outputs?: ChannelOutputCheck[]` — declared, running, missing, observedAt,
      creation — additive and optional; the MockRuntime stays valid unchanged.
- [x] 1.2 `outputVerdictOf` beside `stoppedChannelsOf`: `unknown` / `ok` / `missing` /
      `unverifiable`; `degraded` is reachable; a kept `missing` on an unreachable server is
      `unverifiable`, never silence.
- [x] 1.3 `channels/outputs.ts`: `parseRunningConsumersFromInfo` (no `<output>` ⇒ null, `<port/>` ⇒
      `[]`), `parseDeclaredConsumersFromConfig` (no `<channels>` ⇒ null), `missingConsumers` (per
      kind), `isAirOutputKind`.
- [x] 1.4 `tests/outputs.test.ts` — both plant captures verbatim; 21 cases.

## 2. The bridge

- [x] 2.1 `#readServerConfig` — `INFO CONFIG` once per connection, latched on any `201`,
      retried per tick only while unanswered; keyed by the server that answered.
- [x] 2.2 The running set rides `#readChannelMode`'s reply (`#ingestChannelInfo`, before the mode
      parse); `#readChannelOutputs` is the 60 s re-read (`OUTPUT_RECHECK_MS`, tunable) and the
      post-`ADD` verification.
- [x] 2.3 `#recomputeOutputCheck` — one verdict per label per channel, published on content change,
      stderr on the transition in and once on clear (`describeMissingOutput`).
- [x] 2.4 Reconnect reset in the `state-change` handler (`to === 'healthy' && from !== 'degraded'`):
      declaration, mode latch and creation attempt cleared for that label; the kept verdict is not.
- [x] 2.5 `health()` carries `outputs` per label, sorted by channel; `outputChecksState()` for tests.
- [x] 2.6 `output-check.ts`: `resolveCreateMissingConsumers` (OFF unless `true`),
      `missingConsumerAddCommand` (DeckLink only, the declaration's own tokens),
      `creatableMissingConsumer`, `OUTPUT_RECHECK_MS`. Exported from the barrel.
- [x] 2.7 `#createMissingConsumer` — once per connection per channel; `not-attempted` for a kind the
      bridge does not create; `refused`/`created`/`failed` recorded; re-read after.
- [x] 2.8 `BridgeOptions.createMissingConsumers`, `runtimeTuning.outputRecheckMs`;
      `bin/caspar-bridge.mjs` parses `--create-missing-consumers` (bare; a value refuses to boot) and
      READS THE DEFAULT BACK on the boot line.
- [x] 2.9 `tests/support/harness.ts` — `awaitChannelModeRead` also waits for the check's first latch,
      so the quiescent-wire baseline stays exact.
- [x] 2.10 `tests/output-check.integration.test.ts` — fixture → missing by device; clears on re-read;
      unreachable keeps the verdict as unverifiable; reconnect re-reads; unreadable declaration
      asked once; OFF sends no ADD; ON sends exactly `ADD 1 DECKLINK 23487013 EMBEDDED_AUDIO` once and
      records the 403; ON with a 202 is verified by re-read; ON with a missing monitor is
      `not-attempted`. 9 cases.
- [x] 2.11 `tests/output-policy.test.ts` — 🔴 the resolver's OFF default; the command builder; the
      shipped CLI's boot line OFF / ON / value-refused. Verified red-able: the resolver is the ONE
      function the CLI imports, and the CLI test greps the line the CLI prints from it.

## 3. The mock (`@cg/amcp-mock`)

- [x] 3.1 `INFO CONFIG` answered in the real dialect, declaring `<screen/>` + `<system-audio/>` per
      channel; `INFO <channel>` carries the plant-shaped `<output>` (port_500 + port_600).
- [x] 3.2 Top-level `ADD` / `REMOVE` handlers refusing with the MEASURED codes (403 for a DeckLink
      device the mock does not have, 404 for a grammar error or unknown kind, 404 for REMOVE of a
      consumer that is not running).

## 4. The Runtime

- [x] 4.1 `OutputMissingBanner` (+ `OutputMissingStrip` for hook-less tests): the strip language of
      `ConnectionBanner`/`RasterMismatchBanner`; red for an air kind, amber for a monitor; the
      UNVERIFIED arm; the creation outcome read back; nothing while the link is not live.
- [x] 4.2 Mounted in `App.tsx` after `RasterMismatchBanner`.
- [x] 4.3 `StatusBar`'s `R-058` sentence no longer claims the console cannot read `casparcg.config`
      (it can, since this change — `INFO CONFIG`); it points at the banner for the never-started
      case and keeps "only the log can see" for the stopped-later case. Tree-wide `git grep` for the
      old sentence run; the test and the doc comment updated; the `R-058` PRD record carries a dated
      addendum rather than a rewrite.
- [x] 4.4 `tests/outputMissingBanner.dom.test.ts` — 13 cases: the fixture's words, strip not slab,
      degraded alarms, four must-not-light cases, the unverified arm, monitor-only voice, the refused
      creation sentence, and both hook paths. (The monitor-only voice and the on-banner creation
      sentence were SUPERSEDED by §7 / `B-223` on 2026-09-05 — see 7.2 and 7.3.)
- [x] 4.5 `tests/e2e/pgm-output-missing.spec.ts` — a real bridge on a scripted mock: the fixture
      raises the alert with the words, coexists with a HEALTHY pill, clears when the running set
      gains the decklink; the mock's defaults raise nothing.

## 5. Docs

- [x] 5.1 `docs/prd/caspar.md` — `C-029` filed `[~]`, pointing here.
- [x] 5.2 `docs/prd/bugs-runtime.md` — `B-208`: the consumer-side lying errors (403 " Check syntax."
      for a missing device; the `DEVICE` spelling's 404), `ADD`-replaces-at-a-running-index, and
      `REMOVE`'s early receipt. Filed only.
- [x] 5.3 `docs/prd/b-number-registry.md` — the session entry, numbers derived from headings.
- [x] 5.4 `docs/operator-guide/README.md` — "Program output": what the banner means, what
      "auto-detect" can and cannot mean here, what the check cannot see, the flag.
- [x] 5.5 `docs/prd/runtime.md` — a dated addendum under `R-058`.

## 6. Gate and evidence

- [x] 6.1 Focused suites green: shared-ipc 230/230, amcp-mock 97/97, runtime DOM 24/24, bridge
      (output-policy + output-check + channel-raster + live-seating) 41/41; typecheck + lint green
      for bridge, runtime, shared-ipc, mock; prettier written.
- [x] 6.2 `pnpm gate` green uncached — `Tasks: 93 successful, 93 total · Cached: 0 cached, 93 total ·
Time: 3m11.472s`, openspec `72 passed, 0 failed` (`.gate-logs/gate-20260904T001733Z-4640.log`);
      run again by the pre-push hook on the push, green.
- [x] 6.3 Linux `gate:e2e` — **DISCHARGED** for the commit carrying this change, `d4ffe68f` (the
      docs commit on top of the four code commits `5cd7b43a` / `480a6872` / `65a473a0` / `353edb35`):
      <https://github.com/yasermostafaee/cg/actions/runs/33822182671> — run conclusion `success`;
      job `E2E (Playwright)` **RAN** (not skipped), started `2026-09-04T00:32:20Z`, completed
      `2026-09-04T00:42:22Z`, **10m02s**, conclusion **`success`**
      (<https://github.com/yasermostafaee/cg/actions/runs/33822182671/job/100867069340>); the
      `Lint • Typecheck • Test • Build` job also ran, 5m32s, `success`.
- [x] 6.4 The plant left as found: config still broken (the fixture), no consumer added or removed
      on it (one `ADD 1 DECKLINK 99` refused with 403, `INFO 1` byte-identical before and after).
      The dev host's 2.5.0 was STARTED for the reversibility measurements, its own screen consumer
      restored to `port_500` + `port_600`, and STOPPED at the end of the session.

## 7. `B-223` — severity by air-criticality (session `TICKER-JUDDER-01` §B, 2026-09-05)

- [x] 7.1 `@cg/shared-ipc` `outputs.ts`: `LOCAL_MONITOR_KINDS` (`screen`, `system-audio`),
      `outputSeverityOf`, `isAirOutputKind` re-implemented as "not a local monitor" so an unknown
      kind is AIR, `checksLosingAir`. `AIR_OUTPUT_KINDS` removed (the second list was the drift).
      `outputs.test.ts`: every 2.5.0 kind classified, the unknown-kind case, `checksLosingAir`.
- [x] 7.2 `OutputMissingBanner`: renders only for a check losing air; the headline plus ONE line
      per channel; the engineering detail, the creation outcome and the amber "monitor" tone are
      gone from it. `outputMissingBanner.dom.test.ts` rewritten; red-first per severity class:
      the "missing screen consumer renders NO banner" and "the banner carries the headline and one
      line per channel" cases failed against the old banner (10 of 18 red, sources stashed), then
      green.
- [x] 7.3 `OutputsSection` (`features/connections/`), mounted read-only in `ServerSettingsPanel`,
      fed by `useConnections()`: declared / running / checked-at per channel, AIR rows with the
      `C-030` words + the restart paragraph + the creation outcome, preview / local-monitor rows,
      the kept verdict for an unreachable server. `outputWords.ts` is the one spelling both
      surfaces share. `outputsSection.dom.test.ts` (17 cases) — the former banner addressing test
      (`outputMissingBanner.addressing.dom.test.ts`) folded in, no assertion dropped;
      `serverSettingsPanel.dom.test.ts` stub gains `health`/`onHealthChanged` and one case (the
      section renders; Apply is as enabled as before).
- [x] 7.4 Bridge `describeMissingOutput`: the 🔴 line for an air kind, a plain "noted, not alarmed"
      line for a local-only loss, "Also not running, local only" when both. The bridge test
      `output-addressing.test.ts` gains the two cases (red-first: the screen-only case failed on the
      old line).
- [x] 7.5 `tests/e2e/pgm-output-missing.spec.ts`: the first scenario asserts the one-line banner
      and reads the detail from the dialog's Outputs region; a new scenario stops the screen
      consumer and asserts no alert plus the preview row. Linux `gate:e2e` **DISCHARGED** for
      `3b431f67` (the docs commit on top of the code commit `dfe3adf1`):
      <https://github.com/yasermostafaee/cg/actions/runs/33969010294> — run `conclusion: success`;
      job `E2E (Playwright)` **RAN** (621 s, not skipped), `success`
      (<https://github.com/yasermostafaee/cg/actions/runs/33969010294/job/101314110461>); the
      `Lint • Typecheck • Test • Build` job also ran, 422 s, `success`. Read 2026-09-05 by
      `LAYERS-HEADER-COUNT-01`'s CI follow-up.
- [x] 7.6 Spec, proposal §"Correction 2026-09-05", design §6, this section; operator guide
      "Program output" rewritten for the two surfaces; `C-029` heading addendum; `B-223` filed in
      `bugs-runtime.md`; the registry entry.
- [x] 7.7 Confirmed by grep (§B.4): the check gates nothing — its readers are the two surfaces,
      `health()` and the off-by-default `#createMissingConsumer`; no refusal, no disabled control,
      no failover reads `outputs` or `missing`.
