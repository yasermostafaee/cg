# backup-session — tasks

Lanes, said before each part: §1 `B-312` FULL (the path to air: what reaches the backup core); §2–§3 `R-085`
FULL (a new session, new outbound reads, an IPC schema, a persisted file); §4 `B-313` FULL (it decides what
is sent to a core); §5 the console FULL (it reads a new channel and decides what a station admin can do);
§6 docs.

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

- [ ] 2.1 `backupEngineAddress`; the record's optional `address`; `bridge-session-backup.json`
- [ ] 2.2 The backup's verifier (its own JWKS; `aud`, `exp`, `sub`, `name`; no issuer)
- [ ] 2.3 The backup reads on the backup's session only: D11, D4 (rule 9 at server B's host), the license,
      the introducing D9; the version read for reachability
- [ ] 2.4 `engineState` — the one function; `bridgeSession.engines`, `-changed`, `backup.sign-in`
- [ ] 2.5 `/health`: `casparcg.channels`, `playout.backup`, the backup's problems

## 3. Part C — the fake pair

- [ ] 3.1 The fake engine: a password of its own; bearer-gated reads verified against its OWN key
- [ ] 3.2 Signed in on both; B's D11 lookup with B's token finds B's own clip; CONTROL: with the primary's
      token B answers `401` and the box stays empty with its reason
- [ ] 3.3 Reuse revocation on B leaves A's session and every console untouched, and the reverse
- [ ] 3.4 B `403 cg_not_licensed`: the backup line in words, and the primary still takes
- [ ] 3.5 B unreachable leaves the primary untouched
- [ ] 3.6 The wire: a take, a clear and a failover catch-up send to server A exactly what they sent before;
      to server B the same but for the backup's own clip path — recorded line for line

## 4. `B-313` — never a second sender on the backup core

- [ ] 4.1 `drivesCore`; the guard (start, B's connect, every 15 s); B's session stopped while held; no
      failover to B; `core-held`; server A said only (`core-shared`); its own `/health` never counts
- [ ] 4.2 Tests: a second bridge configured against the backup with a channel holds the primary's mirror;
      CONTROL: idle (first-run), it holds nobody, and ITS AMCP trace carries no layer write

## 5. The console

- [ ] 5.1 «Sign in CG Bridge…» lists the engines (address, state in words), signs the chosen one in; the one
      password line; the banner names the backup
- [ ] 5.2 The status bar's engine chips beside `PRIMARY A` / `BACKUP B`
- [ ] 5.3 The check's Sign-in group: `bridge-session-backup`
- [ ] 5.4 dom specs; e2e: the dialog with two engines, the status-bar states, the check's per-engine lines

## 6. Docs and close

- [ ] 6.1 `pnpm dev:station --fake --pair`
- [ ] 6.2 Engine docs; `CG-BRIDGE-FOR-PLAYOUT.md` (the pair section; `/health`); the guide's "With a backup
      engine"
- [ ] 6.3 Gate, push, CI COMPLETED green with the jobs RAN — the run URLs here
