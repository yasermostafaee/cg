# Tasks — playout-sources (`PLAYOUT-SOURCES-01` v5)

Lane: FULL (the path to air, the wire, an IPC schema, persisted keys, a refusal condition).

## §0 Establish

- [x] 0.1–0.10 answered with anchors in `design.md` §0; `B-286` filed for §0.8 (`docs/prd/bugs-runtime.md`, registry).
- [x] The eight contract letters in `docs/integration/playout/` (seven adopted; V13-STATE already there).

## §1 Bridge

- [x] 1.1 `@cg/shared-ipc`: D10/D11 shapes; `buildPlayoutSourceCatalog`; `redactUrlCredentials`;
      `routeInputGate()` / `ROUTE_NOT_SUPPORTED_YET`; `unseatableWords`; optional entry fields; band-only
      `sources.set-config`; `sources.media-search`; `sources.refresh`; `source-unusable`.
- [x] 1.2 `PlayoutSources`: D10 reader, media search, bound media by `ids=`, two persisted stores, the census.
- [x] 1.3 The catalogue in force rebuilt from the stores; no prune anywhere on a rebuild; boot keeps assignments.
- [x] 1.4 Binding a media id takes the item only from the bridge's own reads; a new unbindable binding refused at
      every door — defaults, look bindings, the swap — by the one rule (`unbindableChange`).
- [x] 1.5 `source-unavailable` / unusable refused before any AMCP, recorded on the row.
- [x] 1.6 The one retry (404 → one `ids=` read, 1.5 s → one retry; the ledger records what was played).
- [x] 1.7 The NDI arm `[NDI] "<source>"`; `playSource`'s doc; `C-021` annotated.
- [x] 1.8 Credentials redacted (log, audit, stderr, refusal command, ledger, catalogue); OSC path dropped.
- [x] 1.9 v1.3: `epoch`, `route` shape, the gate, `compatibleChannels` joined by D4's one rule; D4 `videoMode`
      and `pendingRestart`.
- [x] 1.10 Audio for D10 plates: `VOLUME 0` before every `PLAY` (an in-place replace included), ramped raises,
      silences immediate.
- [x] 1.11 The auth-off local provider (tests only); the sidecar bundle test.

## §2 Console

- [x] 2.1 `Popover`, `VirtualList` and `ComboField` in `renderer/ui/`; the panel owns keyboard and pointer (D13).
- [x] 2.2 `SourcePicker` at the three call sites; `SourceLabel` at the five.
- [x] 2.3 Station setup → Live sources read-only; `LiveSourceDialog` and the editor removed; the ratchet lowered;
      the tab's contract, legend and footer say what is true of it now (D12).
- [x] 2.4 The A sentence never shows a stream URL; the `source-unavailable` line.
- [x] 2.5 The mock fed through the same builder (test flag), media search in the mock, the three doors on the one
      rule, the catalogue redacted for the console (D11).

## §3 Fake Playout, dev station, AMCP mock

- [x] 3.1 D10/D11 as their answer describes; the inputs and 5,000 media; the hooks.
- [x] 3.2 The AMCP mock accepts `[NDI] "…"`; a stale path answers 404 on request.

## §4 Tests

- [x] 4.1 Bridge: wire identity, NDI, outage, restart, 404, unavailable, no prune, clip freshness, the retry,
      credentials, bridge data wins, unusable, v1.3 shapes, per channel, OSC, audio, bundle
      (`playout-sources.integration.test.ts`, `playout-sources-http.integration.test.ts`, `desktop-sidecar.test.ts`).
- [x] 4.2 Normalisation, separation and paging end to end through the fake.
- [x] 4.3 Console dom (`sourcePicker`, `sourceLabel`, `mockPlayoutSources`, `sourcesSection`, the call sites) and
      e2e (`playout-sources.spec.ts`; the seeded Playout in every spec that binds a plate).
      Local Windows run: 289 passed (non-authoritative); Linux: the CI run in Z.2.

## §5 Docs

- [x] 5.1 PRD `C-044`; the registry.
- [x] 5.2 ADR 0010 rule 14.
- [x] 5.3 The pending `live-source-multibox` catalogue requirement amended in place (and `station-setup`'s
      delete/edit scenarios and Live sources footer).
- [x] 5.4 The operator guide: no live-sources section, so unchanged.

## §6 Gate and discharge

- [x] Z.1 Prettier; `pnpm gate` — 96/96 tasks, 0 cached, OpenSpec 90/90 — locally and again as the pre-push gate
      of `b9ff7f4c`; `pnpm openspec validate --all --strict`.
- [x] Z.2 CI at `b9ff7f4c` (the code commit; the contract letters `056c7d8e` and the docs `dcdfb431` are under it):
  - PR https://github.com/yasermostafaee/cg/actions/runs/36328287703 — **success**: the `Lint • Typecheck • Test • Build` job success, and the `E2E (Playwright)` job success with its `E2E` step RAN — runtime 289 passed, Designer 288 passed (12 skipped), no failure and no flake.
  - Installers https://github.com/yasermostafaee/cg/actions/runs/36328287702 — **success**: the `Installers (Windows)` and `Installer smoke (clean Windows)` jobs.
