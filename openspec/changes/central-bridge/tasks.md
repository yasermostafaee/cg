# central-bridge — tasks

## 0. Established and filed

- [x] 0.1 §0 answered (`design.md` §0.1–§0.8), four read-only surveys plus the upstream CasparCG `v2.5.0-stable`
      source.
- [x] 0.2 Filed: `B-293`…`B-295`, `C-046`…`C-048`, `P-061`, `P-062`, `R-078`, `R-079`; `R-067`, `R-068` and
      `B-262` point at this change; the registry records the numbers.
- [x] 0.3 The Playout's letter and our ask copied to `docs/integration/playout/` (byte for byte, scanned: no
      BOM, no control byte); the folder's index names both.

## 1. `OSC SUBSCRIBE` (rule 7, `C-046`) and a failed bind (`B-295`)

- [x] 1.1 `@cg/amcp-mock`: `OSC SUBSCRIBE`/`UNSUBSCRIBE` bound to the connection, reference-counted endpoints,
      the core's default per-client subscription (`oscToAmcpClientsPort`), `restartCore()`
      (`osc-subscribe.test.ts`).
- [x] 1.2 `@cg/caspar-client`: `ServerSession` `oscSubscribe` (inside the handshake, after `INFO`), the
      `oscSubscription` and `oscUnavailable` events; a failed OSC bind no longer stops the loop; the transport
      drops channels not served (`server-session-osc-subscribe.test.ts`).
- [x] 1.3 Bridge: every session subscribes; A = the configured OSC port (default `6251`), B = `+1`
      (`withBridgeOscPort`, at boot and on every applied config); `6250` refused by the schema
      (`RESERVED_OSC_PORT_REASON`), the CLI, `createBridge` and the console's two OSC fields
      (`oscPortError`); served channels = the declared ones (`#servesOscChannel`), and an undeclared
      channel's occupancy read with `INFO` (`stageProducersOfInfo`) so Change channel… is not misled; the
      outcome logged per session (`oscStatus()`); `SIGBREAK` stops the bridge like `SIGINT`; defaults moved
      off `6250` in the console, the mock seed, first-run, the dev station and its fake core (which now sends
      only to subscribers).
- [x] 1.4 Bridge integration (`osc-subscribe.integration.test.ts`): the core's default port held by another
      socket — the bridge subscribes and hears, the holder is untouched; re-subscribed after a reconnect;
      `6250` refused; the bridge-wide port over A and B; an undeclared channel's occupancy from `INFO`.
      Tests that built a deaf bridge by pointing the core elsewhere now also have the core refuse the
      subscribe (their intent kept); three restart tests gained the core restart their "next take" needs.
      Bridge suite 1479/1479, Runtime 2120/2120, dev station 54/54. **Linux e2e discharged** on `668faa8b`
      (carries `4d7d1bfd` and `5b54c84f`): https://github.com/yasermostafaee/cg/actions/runs/36664145921 —
      `completed`/`success`, the `ci` job's `Test` step and the `e2e` job's `E2E` step both RAN. (The first
      run, on `4d7d1bfd`, was red on the Runtime suite's 10-min budget — 307 passed, 3 never ran; `668faa8b`
      measured and raised it.)

## 2. The start check and a core restart (rules 2–3, `C-047`)

- [x] 2.1 A core restart (the mock drops every layer and every connection): reconnect, re-subscribe, the
      restart notice with PUT BACK ON AIR; nothing re-sent without it (`emptied-air-notice.integration.test.ts`
      §4: `restartCore()` under a running bridge — a second `OSC SUBSCRIBE` on the same port, the notice names
      both rows, nothing reaches either layer over several sweeps; the press puts back one row through the
      take, control: the other stays listed and untouched).
- [x] 2.2 At start, `INFO <ch>` per declared channel decides every restored row and every ledger entry; an
      emptied entry → off air with the notice, nothing sent; an occupied layer in 50–99 no entry holds → the
      strip; control: a layer still playing stays ON AIR. The automatic re-ADD on restore is gone. The reads
      run inside the first connection's handshake (`ServerSession` `onHandshake`), before `healthy`, so no
      take can overtake them (a first spelling read after `healthy` and reset a take made in between — caught
      by two existing tests). `blind-occupancy-tap` (the start check sees what a deaf tap cannot; a silent
      layer leaves ON AIR with the notice, nothing sent), `own-stack` (below), and the seven restore tests
      that pinned the re-ADD rewritten to "nothing sent; the next take seats it" (`cleared-row-not-resurrected`,
      `clear-resets-mixer`, `fixed-restore-branch`, `live-add-mute` SITE 2, `local-caspar-station`,
      `restore-channel-fence`, `stack-survives-bridge-restart`). Living text amended in place in the pending
      `runtime-retention-state` delta (dated), and MODIFIED here for the two requirements with no pending copy.

## 3. One store, on the bridge (`B-294`, `B-293`)

- [x] 3.1 `bridge-stack.json`: written atomically on every stack change, restored at start through
      `restore()` (`stack-store.ts`; `createBridge({ stackPath })` restores before the control socket
      listens, saves debounced on `stackChanged`/`straysChanged` and always at close; the CLI's
      `--stack-path` defaults beside the persisted config, and the dev station names it). `own-stack` test:
      a bridge with two rows on air stops, the core loses one page, a second bridge on the same file restores
      both, reads `INFO 1`, names the emptied row, keeps the playing one ON AIR, sends nothing to either;
      an unusable file is said and kept. Bridge suite 1483/1483. **Linux e2e discharged for 2.x and 3.1**
      on `f07c3126` (carries `756a7f81`): https://github.com/yasermostafaee/cg/actions/runs/36668049339 —
      `completed`/`success`, the `ci` job's `Test` step and the `e2e` job's `E2E` step both RAN.
- [x] 3.2 The console re-delivers nothing: its template re-delivery and its stack restore removed from
      `#resync` (which now only READS: the restore report, the strays, the snapshots); `stack.restore` gone
      from the IPC contract and the route table; a `redelivery` import refused before every gate
      (`TEMPLATE_REDELIVERY_REFUSAL`, no row), with the bridge's redelivery machinery removed (two lock
      classes, `isReconnectMachinery`, the tombstones, `templateRedeliveryChange`). An import and a removal
      need the bridge — offline refused (`TEMPLATE_IMPORT_NEEDS_BRIDGE` / `…REMOVE…`). **Changed from the
      first plan:** `StackRetentionStore` and `LibraryStore` STAY, as display copies never sent (two living
      requirements need the offline view — design D5 "As built"). The restore's report is bridge state
      (`stack.restore-report`, its push, a dismissal per channel). The row → record field list is one
      function in `@cg/shared-schema` (`retainedFromStackItem`) for both sides. Tests: runtime
      `reconnect-delivers-nothing` (replaces `reconnect-redelivery`), `stack-retention`,
      `local-library.offline`, `webSocketRuntimeAuth`, `LibraryStore`, `mock-bridge-parity`; bridge
      `lock-scope`, `lock-refuses-intents`, `auth-gate`, `station-channel-fence`, `template-persistence`,
      `audit-append-sites`, `own-stack` (report: two consoles, the push, the scoped dismissal, the benign
      filter); e2e `retention-honesty` (bridges on their own files; 5/5 locally on Windows — a signal, not
      a discharge). Spec: `runtime-caspar-bridge` 1 ADDED, 5 MODIFIED, 1 REMOVED; `runtime-template-library`
      1 ADDED, 1 MODIFIED, 3 REMOVED; `operator-surface`'s pending removal requirement amended in place.
      ⚠ Naming debt: the living "The browser retains stack intent and restores it on reconnect" (amended in
      the pending `runtime-retention-state`) keeps a name that no longer describes it; rename it when that
      change archives — a RENAMED here would collide with its MODIFIED.
- [x] 3.3 Every new template version served at `<id>~<versionId>`; the page sent `Cache-Control: no-store`
      (the 404 too). A version stored before keeps its key, which no later version is given
      (`template-registry` test with a hand-written pre-change record and index). ⚠ **TAKE WIRE: one line
      moved, by decision** — the `CG ADD` path gains `~<versionId>`; `take-all-or-nothing`'s recorded wire
      computes the exact key (not normalised away) and every other line is byte for byte as it was. Twelve
      URL pins updated (registry, HTTP server, siblings, channel-templates, amcp-log, onair-position,
      owned-slot-occupancy, reconnect-reconciliation, serve-render, template-page). Bridge 1484/1484.

## 4. The console ↔ bridge connection (`R-068`, `B-262`)

- [x] 4.1 Auth always on in service mode; an expired or revoked token is refused like none (no read, no
      publish). `requireAuth` makes a start with no Playout a failure (`AUTH_REQUIRED_START_FAILURE`; the
      service configuration sets it — 6.1); `refusedByAuth` answers `invalid` as `absent`, and one
      predicate (`mayBeTold`) gates every push and the pre-sign-in check's narrowing. ⚠ Deferred, on
      purpose: `setup.check`'s pre-sign-in door stays open (narrowed to this station's Playout) until
      CG Control signs in to the Playout itself (7.2/7.3) — the sign-in surface still runs that check,
      and closing it first would break it. ADR 0010 rules 4 and 5 amended (dated);
      `playout-auth-signin`'s pending expiry and revocation text amended in place. Tests: `auth-gate`
      (the expired set equals the never-signed-in set; `requireAuth` with its control), `auth-expiry`
      (reads refused after expiry — control: the same reads before; a still-valid colleague console as
      the instrument that nothing on air changed, and the expired socket pushed nothing),
      `auth-revocation`.
- [ ] 4.2 Per-socket channel scope over every channel-scoped publish and read route, with a coverage test.
- [ ] 4.3 `bridge.capabilities.bridgeVersion`; the console's `major.minor` check — one line, no command.
- [ ] 4.4 Audit rows name the user and the console machine (the socket's peer address).
- [ ] 4.5 e2e: two consoles, one bridge (the multi-box take, the clear, the control).
- [ ] 4.6 Tokens: none, expired, without channel 2 — refused; control: channel 2 works.

## 5. The bridge's own session (rule 8), unlicensed (rule 11), backup (rules 9–10)

- [ ] 5.1 `bridge-session.json`: the rotating refresh token persisted before use; `needs-admin`; the
      admin's one-time sign-in; D4/D9/D10/D11 on the bridge's bearer.
- [ ] 5.2 The crash-between-receive-and-use test; control: the old token never reused.
- [ ] 5.3 A take on an `unlicensed` channel refused with the reason; control: a licensed channel takes.
- [ ] 5.4 A backup's loopback `casparHost` reaches the backup's host (pinned).
- [ ] 5.5 No `Origin` and no `X-Apasai-Mirrored` on any request to the Playout (bridge and native).

## 6. CG Bridge as a service (`R-067`)

- [ ] 6.1 `--service-config`, `%ProgramData%\CG Bridge\` state and logs, `SIGINT`/`SIGBREAK` shutdown.
- [ ] 6.2 `/health` (no auth, no secret, < 1 s, fixed shape, schema-tested).
- [ ] 6.3 The reserved-port check at start (and `--check-ports` for the installer).
- [ ] 6.4 One-time import of an older per-user state (`--import-state`); nothing deleted.
- [ ] 6.5 `/logs.zip` for a station admin; the console's Download logs.
- [ ] 6.6 `/pgm/<n>` on `5280` behind a socket-issued ticket.
- [ ] 6.7 The installer (`tools/bridge-installer/cg-bridge.nsi`) + Shawl, built in CI.

## 7. CG Control, the console

- [ ] 7.1 Bundled console; no sidecar, no Node, no firewall rule; per-user installer.
- [ ] 7.2 Native D1/D2 (no `Origin`); a browser keeps `fetch`.
- [ ] 7.3 The bridge found from the Playout address; the Station setup override; the lines (not reachable,
      needs admin, unlicensed, version); the splash `CONNECTING`.

## 8. Dev station

- [ ] 8.1 `pnpm dev:station` (`--fake`, `--caspar`) starts a bridge the console connects to as to CG Bridge.
- [ ] 8.2 The fake Playout: loopback AMCP, `OSC SUBSCRIBE`, a rotating refresh token, an `unlicensed` channel.

## 9. Release `0.10.0` (`P-061`)

- [ ] 9.1 `tools/release` covers three apps; every file carries `0.10.0`.
- [ ] 9.2 The Persian guide `docs/release/0.10.0/install-guide.fa.md`.
- [ ] 9.3 The clean-Windows smoke: CG Bridge's service, `/health`, rules, `6250` unbound, silent
      install/upgrade/uninstall exit codes; CG Control connects; control: no token, no state.
- [ ] 9.4 `P-031`'s floor at `0.10.0`.
- [ ] 9.5 Tag `v0.10.0` → the draft, its files and sizes read back.

## 10. For the Playout team, and the report

- [ ] 10.1 `docs/integration/playout/CG-BRIDGE-FOR-PLAYOUT.md`, copied to `Claude outputs/`.
- [ ] 10.2 `Claude outputs/REPORT-CENTRAL-BRIDGE-01-v3-<date>.md`.
