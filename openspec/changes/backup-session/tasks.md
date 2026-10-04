# backup-session — tasks

Lanes, said before each part: §1 `B-312` FULL (the path to air: what reaches the backup core); §2–§3 `R-085`
FULL (a new session, new outbound reads, an IPC schema, a persisted file); §4 `B-313` FULL (it decides what
is sent to a core); §5 the console FULL (it reads a new channel and decides what a station admin can do);
§6 the dev station FULL (shared tooling the next session starts from), `B-314` FULL (the persisted
connection), `B-315` FULL (a predicate that decides what an operator sees), then docs.

## 0. Establish

- [x] 0.1 `RELEASE-0112-01` §0 written first, in the report: the pair model, the failure table per layout,
      AMCP admission, the two-bridges answer, the filings; delta B's three answers

## 1. `B-312` — the backup survives a restart

- [x] 1.1 Red first: the installed service, server B set in Station setup, restarted — server B is gone.
      Measured through the real CLI with the fix bypassed: `/health` answered
      `expected [ [ 'A', '127.0.0.1', 3 ] ] to deeply equal [ [ 'A', '127.0.0.1', 3 ], …(1) ]`
- [x] 1.2 `withSavedBackup` (`connection-store.ts`): the saved server B (and its strategy and
      auto-failover) merged into the service's flag-built connection in `bin/caspar-bridge.mjs`; server A
      the configuration file's; a typed `--backup-*` flag wins; a bridge that is not the service is
      unchanged. The start says `server B from Station setup: <host>:<port>`
- [x] 1.3 Tests: `connection-store.test.ts` (the merge; CONTROL: nothing saved, no saved B; a typed B
      wins) and `service-cli.integration.test.ts` (the restart through the real CLI; CONTROL: nothing
      saved — A alone; `--backup-amcp-port 4` beats the saved `2`)

## 2. `R-085` — one session per engine (CG Bridge)

- [x] 2.1 `backupEngineAddress` (`backup-engine.ts`: the primary engine's address at server B's host;
      `--backup-playout-address` names it outright); the record's optional `address`, a session bound to
      it never sending a token saved for another engine; `bridge-session-backup.json`
- [x] 2.2 The backup's verifier (`backupTokenVerifier`: its own JWKS; `aud`, `exp`, `sub`, `name`; no issuer,
      nothing adopted — `PlayoutAuth` untouched)
- [x] 2.3 The backup read on the backup's session only: D11 (`BackupMediaLookup`'s bearer — the primary's
      `usableBearer` was the crossing), D4 (rule 9 at the backup's host), the license, the introducing D9 per
      token gained; the version read (no token) for reachability (`PlayoutVersionReader.reachable`)
- [x] 2.4 `engineState` (`engine-state.ts`) — the one function, its order the order of remedies;
      `bridgeSession.engines`, `-changed`, `backup.sign-in` (`station-admin`, a lock verb, audited
      `server: 'backup'`); the census lists and the scope tables carry them
- [x] 2.5 `/health`: `casparcg.channels`, `playout.backup`, problems `backup-engine` / `core-held` /
      `core-shared` (`health.test.ts`)
- [x] 2.6 Delta C2 — D2's outcome table (`refreshTokenFate`): `400`, `415`, `403`, `404`, `429` kept; `401`
      lost; `5xx`, `423`, no answer never sent again — for the primary's session, the backup's, and every
      console's (`playout-session.test.ts`, `bridge-session-d2-table.test.ts`)
- [x] 2.7 Delta C3 — `cg-bridge` from `2.9.4`: the fake's account and its meters by version
      (`playout-meters.integration.test.ts`: the meters flow with the `cg-bridge` token on `2.9.4`; CONTROL:
      none on `2.9.3`); `suggestedBridgeAccount` (`bridge-engines.test.ts`)

## 3. Part C — the fake pair

- [x] 3.1 The fake engine (`fake-playout.ts`): `password`; `verifyBearers` — every bearer-gated read verified
      against its OWN keys (`foreignRefusals` counts the refused)
- [x] 3.2 Signed in on both through a real bridge: each engine's own password, the other's refused; every
      bearer B received is B's, every one A received is A's (`backup-session.integration.test.ts`). B's D11
      lookup with B's own token finds B's own clip; CONTROL: the primary's token is `401` there and the boxes
      stay empty, `backup-unread` (`backup-media.integration.test.ts`)
- [x] 3.3 A spent token on B: B's session lost, A's signed in, no console signed out, A counts no theft — and
      the reverse
- [x] 3.4 B `403 cg_not_licensed`: the backup's line `not-licensed`, the primary signed in, a take on A sent
      as before
- [x] 3.5 B unreachable: the backup's line `unreachable`, the primary and a take on it untouched
- [x] 3.6 The wire, line for line (`backup-media.integration.test.ts`): a take and a clear (mirror-sync) and a
      failover catch-up (journal-replay) send server B exactly server A's writes but for the backup's own clip
      path — and the same two tests pass on the pre-change runtime and adapter (measured: both stashed and
      rebuilt), so what reaches server A did not move

## 4. `B-313` — never a second sender on the backup core

- [x] 4.1 `drivesCore` / `CoreGuard` (`core-guard.ts`): read at start, on server changes and every 15 s; server
      B held until the first answer, then while another CG Bridge drives its core (`holdServerB`: its session
      stopped, `RedundancyAdapter.setHeld` — no failover onto it, no line, no replay); `core-held`; server A
      said only (`core-shared`); its own `/health` never counts (`startedAt` + port)
- [x] 4.2 Tests (`backup-session.integration.test.ts`): a second bridge on the backup core with a channel → this
      bridge never connects there (the core admits one connection), its AMCP log names no line to server B,
      server A takes, `/health` and the backup line say `core-held`; CONTROL: an idle (first-run) second bridge
      holds nobody (the core admits both, the mirror reaches it) and ITS own lines carry no layer write.
      `core-guard.test.ts`, `engine-state.test.ts`

## 5. The console

- [x] 5.1 «Sign in CG Bridge…» lists the engines (address, state in words), a `Tabs` choice signs the chosen
      one in through its own channel; the one password line; the banner names the backup; C3's account offer
      (`bridgeSessionBanner.dom.test.ts`)
- [x] 5.2 The status bar's engine chips beside `PRIMARY A` / `BACKUP B` — a prop from the shell
      (`statusBar.engines.dom.test.ts`)
- [x] 5.3 The check's Sign-in group: `bridge-session-backup` (`connectionCheckGroups.dom.test.ts`)
- [ ] 5.4 e2e `backup-engine.spec.ts` (the dialog with two engines, each engine's own password, the
      status-bar states, the check's per-engine line) — green on Windows; the Linux run owed

## 6. The dev station's pair, what it found, docs and close

- [x] 6.1 `pnpm dev:station --fake --pair`: `fake-station.ts`'s backup engine (its own fake Playout and
      password, both engines verifying bearers, its own CasparCG stand-in on 5251); the bridge told
      `--backup-host`/`--backup-amcp-port`/`--backup-playout-address`; both passwords on the banner; UDP 6252
      probed; a `fake-pair` state folder. Tests: `station-plan.test.ts` (the flag and its two refusals, the
      argv, the ports, the banner; CONTROLS: no pair, no `--backup-*`), `station-sequence.test.ts` (the start
      handed the backup), `fake-station.integration.test.ts` (each password and each token refused at the
      other engine; CONTROL: each served at its own). Run for real on 2026-10-04 and driven in Chrome:
      first-run, «Sign in CG Bridge…» naming both engines, the primary's password refused on the backup, both
      signed in, `BACKUP B HEALTHY`, no engine chip
- [x] 6.2 `B-314` — first-run's channel pick kept no server B (found reading `firstRunConnection` while
      building 6.1: it wrote server A alone over a pair). Red first in `firstRunStation.test.ts`, which
      received server A alone where A and B were expected; `firstRunConnection` keeps a declared server B; the
      old "ONE server" expectation replaced, not left beside it; CONTROL: no server B, none written. In 6.1's
      run the connection in force and the one saved both kept server B after first-run
- [x] 6.3 `B-315` — a channel heard before the first declaration aged into `NOT PRODUCING`: 6.1's run read
      `⚠ A NOT PRODUCING · CH 2` on a healthy station; the one-engine comparison run did not show it only
      because first-run rebuilt server A's session there (two `OSC SUBSCRIBE` lines against one). Red first
      (`channel-ticks-served.integration.test.ts`: channel 2 still listed after declaring channel 1); R-058's
      list filtered by `#servesOscChannel`; CONTROL: a served channel that stops is still reported. 6.1's run
      again after the fix: `PRIMARY A HEALTHY · BACKUP B HEALTHY`, no chip, no problem
- [ ] 6.4 Engine docs; `CG-BRIDGE-FOR-PLAYOUT.md` (the pair section; `/health`); the guide's "With a backup
      engine"
- [ ] 6.5 Gate, push, CI COMPLETED green with the jobs RAN — the run URLs here

## 7. `RELEASE-0112-01` Part D and delta C — the release `0.11.2`

Lane: FULL (delivery: the version, the installers' contract and the guide a client follows).

- [x] 7.1 Delta C1 (`P-066`) — CG Bridge's Installed-apps row pinned: `installed-apps.mjs`, the one reader; the
      CG Bridge smoke after the install and the upgrade; every release acceptance after the classic install and
      the upgrade; a new `acceptance-upgrade-0111` job from the `v0.11.1` draft (the draft job waits for it).
      Read on the clean runner (Desktop 37228341119): one row each, 64-bit view, key `CGBridge`, `CG Bridge`,
      `0.10.0` / `0.11.0` / `0.11.1`. The `0.11.1` job's own six reds there were the same-version reinstall
      ("Reinstall CG Bridge?") a `0.11.1` build meets over `0.11.1` — the premise of the bump below
- [x] 7.2 `0.11.2` in all nine version sources (`release-version.mjs --set 0.11.2`); `P-031`'s floor moved to
      `0.11.2` with an empty `git diff v0.11.1` over the five floor files (control: `bridge-session.ts`, 120
      lines); the session record's optional `address` and the new backup file said there
- [x] 7.3 The guide `docs/release/0.11.2/install-guide.fa.md`: «با موتورِ پشتیبان» (the separate server beside
      both engines, the box unticked on both, server B in Station setup, the backup engine's sign-in, the
      status bar's words); the Playout's two lines quoted exactly and unmarked; `/MERGETASKS="!cgbridge"` only
      where a silent install is said; three marks, all the backup engine's. Their letter adopted into
      `docs/integration/playout/`. `guide.test.ts`: ten sections, the new labels against their sources, the
      marks counted and placed, their lines read from the letter
- [ ] 7.4 The `0.11.2` pictures from a Desktop run of the bump; then gate, push, CI green with every job RAN
- [x] 7.5 `CG-BRIDGE-FOR-PLAYOUT.md` at `0.11.2`: §3 a primary and a backup engine (the layout, server B, a
      session per engine, a backup problem never stopping the primary, the guard); `/health`'s new fields and
      codes; the Installed-apps entry as a guarantee (§2); D2's table, the disabled-user sentence corrected
      where §3 stated it and where §6 asked it (now §7, their answer); the version policy (a new file and
      hash per release, so a new engine build; the skip rule); `/S` and every exit code unchanged
- [ ] 7.6 Tag `v0.11.2`; the draft "APASAI CG 0.11.2" read back, sums checked; `v0.11.1` retitled superseded;
      NOT published
