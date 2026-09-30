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
      **Linux e2e discharged for 3.2 and 3.3** on `4274b7fc` (carries `dcde7685`):
      https://github.com/yasermostafaee/cg/actions/runs/36674757252 — `completed`/`success`, the `ci`
      job's `Test` step and the `e2e` job's `E2E` step both RAN (so `retention-honesty` on the bridge's
      own files, and the notice's dismissal, ran on Linux).

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
- [x] 4.2 Per-socket channel scope over every channel-scoped publish and read route, with a coverage test.
      `channel-scope.ts` classifies all 85 routes and all 27 runtime publishes (scoped with a
      projection · station-wide · per-socket · intent); `wirePublishes`, the PGM push and the read
      answer go through it with the socket's scope (`socketScope`: `grantsChannel`; `null` for auth
      OFF and a `*` grant); unclassified tells a scoped socket nothing. As built, the banks, channel
      settings, template lists and source assignments are station-wide CONFIGURATION, not D4's first
      list — the survey showed a narrowed bank set turns a channel's bulk verbs station-wide and a
      whole-set write drops other channels (design.md D4). The restart notice carries each dropped
      seat's channel (`seatChannels`) so its count narrows too; both dismissals reach only what the
      dismisser was told; the Layers view says `This channel is not in your sign-in.` for a READ ONLY
      channel instead of EMPTY rows (`playout-authz-channels` delta amended in place). Tests:
      `channel-scope` (coverage both ways, read≠intent, every scoped projection on a schema-valid
      two-channel fixture, fail-closed; planted: a demotion and a leaky projection both caught),
      `channel-scope.integration` (three consoles on a real two-channel authed bridge: reads, pushes,
      the restart notice and its scoped dismissal; planted: the scope switched off — both red),
      `own-stack` (the scoped restore-report dismissal, both halves), runtime
      `layersPanel.channelScope.dom` (the fact — control: a held channel's rows; shown red first),
      e2e `playout-authz` (the viewer's fact — control: the operator's view has none).
- [x] 4.3 `bridge.capabilities.bridgeVersion`; the console's `major.minor` check — one line, no command.
      `releaseLine` / `sameReleaseLine` / `versionMismatchRefusal` live once in `@cg/shared-ipc`; the
      bridge answers its own manifest's version or the CLI's (the bundle's inlined one); the console
      compares at every connect, refuses every request but `bridge.capabilities` and `auth.*` in
      `#invoke` before a frame is written, and shows the line in the skew banner (it outranks a skew).
      Every other request waits for the capabilities answer first (a take pressed in the first round
      trip went out to another release before the answer landed — found by a fake that raced it, shown
      red-first). The capability list stays for `B-153` — the channel's own doc records why both exist.
      Tests: runtime `bridgeSkew` (another line: the take refused, no frame — control: the handshake
      went out; a press before a slow answer: refused, no frame — control: a slow same-release answer,
      the take goes out after it; a patch difference: the take goes out; no version: "older than 0.10";
      §5's planted `0.9` console against a REAL `0.10` bridge: the line, and no take or read written —
      control: the handshake went out; a real matched pair: no mismatch), `bridgeSkewBanner.dom` (the
      line, outranking a skew, following the answer), `mock-bridge-parity`, `bridgeTimeoutWords` (its
      fake answers the release); bridge `auth-gate` (the version to an unsigned socket, own vs given).
- [x] 4.4 Audit rows name the user and the console machine (the socket's peer address). The socket's
      `AuthSession` carries the address (`consoleAddressOf`: IPv4-mapped reduced, over-length → none);
      `#recordAudit` stamps `consoleAddress` from the acting session as it stamps `actorSub`; the Log
      shows it on the actor cell's title. Tests: bridge `auth-principal` (a take and a sign-out name
      `127.0.0.1` — control: a take no console caused carries none; the address unit, with the
      over-length case), runtime
      `auditPanel.legibility.dom` (the title and `data-audit-console` — control: a row without it has no
      title).
- [x] 4.5 e2e: two consoles, one bridge (the multi-box take, the clear, the control).
      `two-consoles.spec.ts`: an in-process bridge with auth ON against the fake Playout, the AMCP mock
      behind it, two browser contexts signed in through the real form as two operators of channel 1.
      A takes a two-box page on bed 59 → B shows ON AIR within 1 s; the plate band holds both boxes
      (the instrument, shown live); B clears → A shows it cleared within 1 s and the mock's stage holds
      nothing on 60–79 — CONTROL: the logo on row 80 stays ON AIR on both consoles and on the mock.
      Passed locally on Windows (a signal, not the discharge — the Linux run is CI's).
- [x] 4.6 Tokens: none, expired, without channel 2 — refused; control: channel 2 works.
      `central-bridge-tokens.integration` on the authed two-channel rig, read at the fake CasparCG's
      own trace: no token — a take and a read refused with the sign-in sentence, no write, no push;
      an expired token — refused at presentation (`AUTH_TOKEN_EXPIRED`), then treated as none; a
      channel-1 token — a take and a load on channel 2 refused naming channel 2, no channel-2 write,
      and channel 2's row absent from its stack — CONTROL: a channel-2 token takes the same row and
      the same instrument sees `CG 2-80 PLAY`.
- **Linux e2e discharged for 4.1, 4.3 and 4.4** on `a832b533` (carries `27ccc5c2` and `4502488f`):
  https://github.com/yasermostafaee/cg/actions/runs/36679895375 — `completed`/`success`, the `ci` job's
  `Test` step and the `e2e` job's `E2E` step both RAN. The same push's Desktop run
  (https://github.com/yasermostafaee/cg/actions/runs/36679895363) FAILED at "Scan what the installers
  ship": 4.4's doc comments used a private example address that the builds keep — fixed in `9ec34e2a`
  (a documentation address; the local scan of the staged payload passes, and the replaced comment is
  shown present in the three bundles the run named).
- **Linux e2e discharged for 4.2** on `9ec34e2a` (carries `8315909c`):
  https://github.com/yasermostafaee/cg/actions/runs/36683576370 — `completed`/`success`, `Test` and `E2E`
  both RAN (with `playout-authz`'s viewer fact). Its Desktop run
  (https://github.com/yasermostafaee/cg/actions/runs/36683576368) passed the payload scan and the
  clean-Windows installer smoke. **For 4.5 and 4.6** on `d2eb0cd9`:
  https://github.com/yasermostafaee/cg/actions/runs/36685100324 — `completed`/`success`, `Test` and `E2E`
  both RAN (`two-consoles.spec.ts` on Linux).

## 5. The bridge's own session (rule 8), unlicensed (rule 11), backup (rules 9–10)

- [x] 5.1 `bridge-session.json`: the rotating refresh token persisted before use; `needs-admin`; the
      admin's one-time sign-in; D4/D9/D10/D11 on the bridge's bearer.
      `bridge-session.ts` (tmp → write → `fsync` → rename, owner-only; the record never holds a
      password); D1/D2 moved ONCE to `@cg/shared-ipc` (`playout-session.ts`, the console re-exports
      it); `bridgeSession.state` / `.state-changed` / `.sign-in` (station-admin, operator lock,
      audited `bridge-sign-in` with no credential); `PlayoutAuth.useOwnBearer` — the bridge's bearer
      first for D4/D10/D11 (`usableBearer`) and D9 (the poll, armed with no console signed in), a
      console's only as the fallback; the introducing D9 read on every token gained. CLI
      `--bridge-session-path`, NO default (a dev bridge must not start asking for an admin; the
      service configuration names it — 6.1). Console: the `BridgeSessionBanner` line, and a station
      admin's dialog (the account prefilled `cg-admin`, the password dropped after its one request).
      Found and fixed on the way: `playoutFetch` sent NO request body (every earlier call was a GET),
      so the bridge's own D1 reached the Playout empty. Tests: `bridge-session` (needs-admin; the
      admin's sign-in — no password in the file; a wrong password — the code, nothing written; a
      restart rotates the token; a `401` refresh is a lost session — A.2: a refusal BEFORE use is
      not), `bridge-session.integration`
      (operator refused, admin succeeds, every console pushed, the record names the admin and holds
      no password, the D9 read carries `cg-admin`'s bearer, D4 continues with it after every console
      closed), census updates (`authz-classes`, `lock-refuses-intents`, `audit-append-sites`), runtime
      `bridgeSessionBanner.dom` (the line; no control for an operator; the refusal's sentence; the
      password gone after a refusal, after close and from storage).
- [x] 5.2 The crash-between-receive-and-use test; control: the old token never reused.
      `bridge-session` 5.2: the refresh saves T1 and the process "dies" at the first step after the
      save; the restart refreshes with T1 and is signed in; D2 saw `[T0, T1]` — T0 once, never again.
      ~~The residual: a crash BEFORE the save leaves the spent T0, the restart presents it once, is
      refused, and says it needs an admin.~~ SUPERSEDED 2026-09-30 by A.1: under Playout `2.9.2` that
      second presentation is a reuse (theft, past 10 s), so the restart now sends NOTHING — the
      in-flight mark says why; that test was replaced by A.1's.
- [x] 5.3 A take on an `unlicensed` channel refused with the reason; control: a licensed channel takes.
      `isUnlicensedPlaylist` and `unlicensedTakeRefusal` live once in `@cg/shared-ipc`; the console's
      line (`channelAir.isUnlicensed`) now asks the same predicate; the runtime refuses FIRST in
      `#takeImpl` (after the rehearse interlock, before any mutation or send), so `PUT BACK ON AIR` is
      refused the same way; the verdict is read at take time from the D4 reader's rows through
      `joinedPlaylist` — `stationChannelsFor`'s join. Tests: `unlicensed.integration` (the take
      refused with the sentence, no channel-2 write, audited `failed`/`unlicensed` — control: channel 1
      takes and `CG 1-80 PLAY` is on the wire; a removal passes; shown red first).
- [x] 5.4 A backup's loopback `casparHost` reaches the backup's host (pinned).
      `playout-address.integration` — a reader built for the backup's address (its host from the
      bridge's own `playoutHostOf`) reads a `127.0.0.1` row as the backup's host — control: the
      primary's reader reads the same row as the primary's. The living requirement "A loopback
      casparHost is the Playout's own machine" MODIFIED with the per-reader clause.
- [ ] 5.5 No `Origin` and no `X-Apasai-Mirrored` on any request to the Playout (bridge and native).
      The BRIDGE half is done: `bridge-session.integration` reads every request the fake Playout
      received (the bridge's D1, the D9 poll, D4) for both headers — none — with its control (the log
      holds the D1 and a bearer). The NATIVE half (CG Control's own D1/D2) is owed with 7.2.

## 5A. Delta `CENTRAL-BRIDGE-01-A` — Playout `2.9.2` (`PLAYOUT-CG-RESPONSE-LICENSE-v1` §2, §8, §9)

- [x] A.1 The bridge's refresh under reuse detection (their §8): serial; the in-flight mark
      (`refreshInFlight`, the token's sha256 id) written BEFORE D2 — no mark, no send; the successor
      written with the mark cleared before use; a mark at start, an unknown outcome (timeout, dropped
      answer) and a `401` → `needs-admin`, the token never sent again; a request that never reached
      the Playout (`ECONNREFUSED`, `NO_IPV4`, a 5 s connect bound) keeps the token. `refreshTokenFate`
      is the one reading, in `@cg/shared-ipc`. Tests (`bridge-session`, A1): the crash-between-send-
      and-save restart past 10 s sends nothing and trips no theft; an unknown outcome is never
      retried; no mark, no send; never reached → asked again; CONTROL three clean restarts; the
      INSTRUMENT (the fake trips on a reuse after 10 s, not within, and puts the account's access
      tokens on D9). Ablations, each reddening its test: the mark ignored in BOTH `start()` and
      `#refresh()` (either alone holds), unknown retried, mark-less send, 403 lost, never-reached lost.
- [x] A.2 A refusal before use keeps the token (their §2): `403`/`423`/`429` → state `refused` with the
      Playout's message, unmarked, asked again every 60 s; every console shows `CG Bridge: <message>`
      (isolated); a station admin keeps the sign-in. `kept` is the contract's named refusals only — a
      wrong `kept` resends a used token a minute later, so a status the contract does not name is
      `unknown`. Tests: `bridge-session` A2 (`cg_not_licensed` kept, the same token then refreshes;
      `no_cg_access`); `playout-session` (the fate of every status); `bridgeSessionBanner.dom` A2.
- [x] A.3 `cg_channels` in three shapes (their §2, §9): `normalizePlayoutChannels` inside
      `PlayoutChannelsSchema` — `"*"`, a list, a lone grant (D8 before `2.9.2`) → a list of one; no role
      stands in for the claim. Nothing in the product reads D8 today; the fake's D8 answers both
      versions (`setMeLegacy`). Tests: `cg-channels-shapes` (the verifier: `"*"`, an ADMIN's explicit
      list holds only that channel, a lone object; D8 2.9.2 and legacy parse), `playout-channels`.
      Ablation: the normalizer removed reddens exactly the lone-object cases on both sides.
- [x] A.4 `403 cg_not_licensed` at D1 (their §2): `signInFailureLine` — the Playout's message as it is,
      one line (whitespace collapsed), in a `<bdi>`; no field marked; the form kept; the console's
      sentence only as the fallback. The gate, first-run and the bridge's admin dialog.
      `signInOverlay.dom` A4 (both), `bridgeSessionBanner.dom` A4.
- [x] A.5 The CONSOLE's refresh (`playoutRefresh.ts`): one at a time per stored session — a Web Lock
      where the page has one, else a mark read back after it settles (a LAN `http://` page has
      neither `navigator.locks` nor `crypto.randomUUID`); the latest token (another tab's rotation
      adopted); a no-token probe first, so "never sent" is known; a lost answer, a `401`, an orphaned
      mark → the refresh token dropped, the access token living to `exp`; `refused` → kept, on the
      signed-in state (the pill's `title`), asked again every 60 s. The old retry (the same token 15 s
      later) is gone. Tests: `playoutRefresh` (14), `webSocketRuntimeAuth` (3 — RED on the old
      runtime: the token sent FIVE times in five minutes; the A2 state missing).
- [ ] A.6 The Linux e2e discharge for A.1–A.5 (run URL).
- A.7 A dedicated Playout account for CG Bridge (not `cg-admin`): assessed in the report, NOT built — it
  needs an admin step in the Playout, and the owner decides.

## 6. CG Bridge as a service (`R-067`)

- [x] 6.1 `--service-config`, `%ProgramData%\CG Bridge\` state and logs, `SIGINT`/`SIGBREAK` shutdown.
      `service-config.ts`: `cg-bridge.json` (`playoutAddress`, `amcpHost?`, `amcpPort?`, `oscPort?` —
      never 6250 —, `controlPort?`, `templatePort?`, `bridgeAddress?`; strict: a typo is refused) fills
      the flags the command line did not give (the command line wins); its directory is the state
      home (`.cg-runtime\`, `logs\`); the service always runs `--auth playout`, `--host 0.0.0.0`,
      `--first-run`, its own `bridge-session.json`, and `requireAuth`. A missing or bad file is a
      start failure naming the file — never `~/.cg-runtime`. The installer never writes the JSON
      itself: `--write-service-config <file>` writes it through the same schema and keeps what it
      was not given (an upgrade). `SIGINT`/`SIGBREAK` were already one shutdown (Shawl stops with
      Ctrl+C). Tests: `service-config` (8), `service-cli.integration` (6 — a refused start names the
      file and writes nothing to the home; 6250 refused; the write one-shot and its upgrade; a real
      start authenticates, answers `/health`, and names every file under the configuration's
      directory while the user's home stays empty).
- [x] 6.2 `/health` (no auth, no secret, < 1 s, fixed shape, schema-tested).
      `health.ts`: `BridgeHealthSchema` (`.strict()` at every level — a field is added with the
      document, never silently), built from memory (`runtime.health()`, `oscStatus()`, the bridge's
      own session, D4's last good read, the socket count, the ports, the port problems); no account
      name, no token. D9: the control socket now sits on its own `http.Server` on `5280` — `/health`
      beside the upgrade, `503` for the instant before the bridge is built, `426` for anything else
      (what `ws` answered before). Tests: `health` (6 — the exact example the Playout document
      quotes; an extra field refused; no account name; backup/failover/silent OSC/down; the
      needs-admin line; a port problem), `health-endpoint.integration` (3 — 200, the shape, < 1 s,
      `no-store`, the consoles' socket on the same port counted; 426; a core that is not there).
- [x] 6.3 The reserved-port check at start (and `--check-ports` for the installer).
      `reserved-ports.ts`: `netsh interface ipv4 show excludedportrange` for TCP and UDP, read by
      the rows' shape (the header is localized); a port inside a range is one log line and one
      `/health` problem naming the port, its role and the range; no verdict (never "free") when the
      ranges cannot be read; never a port changed. At start after the listen (never delaying it),
      opted into by the CLI; `--check-ports` exits 3 for the installer to warn. Tests:
      `reserved-ports` (8 — a real Windows 11 table and a localized one; this host's own table has
      the same shape).
- [x] 6.4 One-time import of an older per-user state (`--import-state`); nothing deleted.
      `import-state.ts`: the NEWEST `<user>\AppData\Roaming\CG Control\.cg-runtime` is copied into an
      EMPTY service state once — never `bridge-session.json` (a refresh token belongs to one
      process, `2.9.2` §8), `bridge-playout.json` or `bridge-connection.json` (the service's Playout
      and CasparCG come from its own configuration); the marker `bridge-imported-state.json` makes it
      once, whatever the outcome; the source is left byte-identical. Tests: `import-state` (4); the
      persisted-files census records the marker and `bridge-session.json`'s new default.
- [ ] 6.5 `/logs.zip` for a station admin; the console's Download logs.
- [ ] 6.6 `/pgm/<n>` on `5280` behind a socket-issued ticket.
- [ ] 6.7 The installer (`tools/bridge-installer/cg-bridge.nsi`) + Shawl, built in CI.
      Written: `cg-bridge.nsi` (ASCII; per machine; `%ProgramFiles%\CG Bridge\` = `cg-bridge.exe` +
      `shawl.exe` + the bundle; the service `CGBridge` registered once by `shawl add` — Ctrl+C stop,
      10 s, then the process tree —, then `start= auto`, `obj= NT SERVICE\CGBridge`, recovery
      restart/5 s/5 s/30 s with `failureflag 1`, NO dependency; the data folder's ACL replaced
      (SYSTEM, Administrators, the service's own account — no ordinary user reads the bridge's
      session); the configuration, the import, OUR three firewall rules and the port check all by the
      bridge's own one-shots, every step logged to `logs\install.log`; exit 0 / 1 cancelled / 2
      failed; the uninstaller removes our service, rules and files and KEEPS the data folder).
      `stage-bridge.mjs` (the official `node.exe`, Shawl 1.9.0 from `cargo install --locked`, the
      bundle, both licences); `desktop.yml` builds it (the runner's NSIS, else Chocolatey's) and a
      NEW job, `bridge-smoke`, drives `tools/bridge-installer/smoke.mjs` on a clean runner (silent
      install, the service's state/start/account/dependencies/recovery, `/health` < 1 s, the rules
      on the exe, nothing on UDP 6250, the ACL, no state for a console with no token, a silent
      upgrade, a silent uninstall). NOT YET RUN: open until that job is green.
      The firewall rules: `firewall-rules.ts` + `--firewall add|remove` — `CG Bridge - consoles` (TCP
      control), `- template pages` (TCP templates), `- OSC from CasparCG` (UDP osc and osc + 1, server
      B's; never 6250), each scoped to the running `cg-bridge.exe`, on the ports in force; add =
      delete ours then add ours; remove = delete ours; nothing else touched. Tests: `firewall-rules`
      (6).

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
