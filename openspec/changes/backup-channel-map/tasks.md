# backup-channel-map — tasks

Lanes, said before each part was touched: every part is FULL LANE — the path to air (what reaches core B), the
wire, an IPC schema, a persisted file, a refusal condition, the console's statement of what reaches air, and the
delivery (`0.11.3`).

## 0. Establish

- [x] 0.1 `RELEASE-0113-01` §0 written first, in the report: every line that reaches B and where its channel sits;
      every read from B that carries a channel; the fake pair's numbers; the numbers after a failover
- [x] 0.2 Filed `B-316` (bugs-runtime) and `R-089` (runtime), measured free on all 8 refs; the Playout team's letter
      adopted (`PLAYOUT-CG-RESPONSE-0112-PAIR-v1.md`) and indexed

## 1. The seam (`packages/caspar-client`)

- [x] 1.1 `RedundancyAdapter`: `serverBLine` required with a server B (a construction without it throws); every road
      to B — fan-out, every send while B is the primary (`mirror: false` included), failover catch-up, corrective
      resend — asks it through one private `ownLine`; a refused line is sent nowhere and is no divergence; the
      `?? line` fallbacks are gone; server A's line untouched
- [x] 1.2 `OscTransport.setChannelMap` (core channel → station channel or none), re-keying before every tap;
      `setServedChannels` a wrapper of it
- [x] 1.3 Tests: `redundancy-adapter.test.ts` § `B-316` (the construction refused without it; mirror-sync and
      mirror-async: A byte for byte, B `2-…`, an unmapped channel A alone and no divergence; the journal-replay
      catch-up and the corrective resend `2-…`; B as primary: mirrored and primary-only both `2-…`, an unmapped one
      refused with nothing sent); `osc-transport.test.ts` (re-keyed before the taps, an unmapped one dropped);
      the mechanics suites (`failure-matrix`, the soak harness) state `SAME_NUMBERS_ON_B` — never a default

## 2. Translation, guard and mapping (`tools/caspar-bridge`)

- [x] 2.1 `server-b-line.ts`: `translateForServerB` and `serverBLineRefusal` (the guard), pure;
      `server-b-line.test.ts` (31) over every line shape `CommandBuilder` emits, both `route://` kinds, channel-free
      lines, unknown shapes, a planted verbatim line (CONTROL: translated, it passes)
- [x] 2.2 D4 row schema: `mirrorOf` (lenient); `mirrors` deliberately not parsed
- [x] 2.3 `backup-channels.ts`: the Playout's rule, the entry check, disagreement, validity (server B, video mode,
      `cgLicensed`), B's D4 freshness (30 s), A's last good rows, held-until-next-take; `backup-channels.test.ts`
      (25) — every D4 shape the prompt lists
- [x] 2.4 `backup-channels-store.ts`: entries stamped with server B, written durably (temp, `fsync`, rename), not
      used for another server B
- [x] 2.5 The runtime: `serverBLine` into both adapter constructions; B's OSC and acknowledged clears mapped back;
      the start check on B at B's number; `#send`'s refusal while B is the primary (`backup-unmapped` /
      `backup-route` / `backup-guard`); `take`'s refusal in words, before anything mutates; `release` at a take;
      `holdsLiveLayersOn`; `serverBVerbatim` (TEST-ONLY); `set-backup-channels` audited (schema first)
- [x] 2.6 The bridge: the resolver wired (A's catalogue, the backup engine's catalogue — re-read at B's sign-in and
      on B's reconnect — the entries, the config, the declared channels, a 5 s tick); `backupChannels.state` /
      `.changed` / `.set-entries` (station-admin, lock, audit; the census tables); `/health` per-server `channels`
      and the `backup-channels` problem; `B-313`'s guard compares B's mirror channels (and re-reads when the
      mapping changes)
- [x] 2.7 The fake pair: B's core 5 channels (1 its own programme, 2 and 3 the mirrors, 4 and 5 previews); B's D4
      with `mirrorOf`; A's D4 with `videoMode` and `mirrors`; the dev station's banner (`station-plan.test.ts`)
- [x] 2.8 The decisive control — `backup-channel-map.integration.test.ts` (the real resolver over `2.9.5` rows): a
      take, an UPDATE, a look switch, a swap, a clear, a `CLEAR ALL` and a restore (core A restarted empty, PUT
      BACK ON AIR) on CH 1 — core B's wire names channel 2 and nothing else; the failover catch-up the same.
      Red on the old seam: `backup-wire-control.integration.test.ts`, run UNCHANGED on `7ef2f274` (a worktree),
      failed `expected [ 1 ] to deeply equal [ 2 ]` — B received `INFO 1`, `MIXER 1-80 VOLUME 1`… — and passes here
- [x] 2.9 An unmapped channel (A airs, B's wire empty); after a failover a take refused in words with nothing sent;
      a mapping change while live (nothing to 2 or 4, then the take to 4); the guard refusing a planted verbatim
      take; A's wire LINE FOR LINE against `0.11.2`'s (`fixtures/wire-a-0112.json`, 78 writes recorded from
      `7ef2f274`; positive control: one changed line reddens it); the bridge over HTTP
      (`backup-channels-bridge.integration.test.ts`: mapped from B's D4, `/health`, a `2.9.2` backup with an
      entry refused then accepted, audited, kept across a restart); the existing pair tests given explicit maps —
      the media wire tests now at B's own channel 4, the `B-313` tests per channel

- [x] 2.10 🔴 The guard's window (red on `950aa2a2`'s PR run 37323750849, green locally by timing): a mapping that
      appeared reached core B before `B-313`'s guard had read the neighbour WITH it. A backup channel now carries a
      line only once a completed reading made with it came back clean (`CoreGuard.clearsB`, the runtime's map
      gated by it; `/health` and the guard read the mapping in force); a refresh during a reading is one more
      after it. `backup-session.integration.test.ts` — a neighbour answering 2.5 s late: red on the old seam
      (`MIXER 2-99 VOLUME 0` and three more to B), none now; `core-guard.test.ts` (4 new; the follow-up read's
      test red, by name, with the old `refresh`)

## 3. The console (`apps/runtime`)

- [x] 3.1 The status bar's `BACKUP B · n of m channels mapped`; the channel view's backup line; the PROGRAM pane's
      `Not available on the backup engine` while B is the primary (its sound toggle and loudness meter absent
      there) — `useBackupChannels`, the bridge contract's `backupChannels` (WebSocket, mock, parity)
- [x] 3.2 Station setup → Servers → `Backup engine`: one line per declared channel, the entry and its state
      (`BackupChannelsCard`; a field and `Save backup channels` for a station admin only)
- [x] 3.3 Part D: the password line in the Playout team's words inside `<bdi>` (`ENGINE_PASSWORD_WHERE`, read
      against their letter by `bridge-engines.test.ts`), led by the account offered; the AMCP-pending line says what
      to do — «تأیید» on that engine's «اتصال به CG Control», the Playout client connected to it
- [ ] 3.4 dom tests; e2e: the Station setup lines, the status bar's `n of m`, the channel view's backup line — run, and
      the Linux run's URL here

## 4. Docs and close

- [ ] 4.1 The guide's "With a backup engine" (`0.11.3`); `CG-BRIDGE-FOR-PLAYOUT.md` at `0.11.3`
- [ ] 4.2 Gate, push, CI COMPLETED green with the jobs RAN — the run URLs here

## 5. `RELEASE-0113-01` Part E — the release `0.11.3`

- [ ] 5.1 `0.11.3` in every version source; `P-031`'s floor at `0.11.3`
- [ ] 5.2 The `0.11.3` pictures from a Desktop run of the bump; clean-Windows acceptance (fresh; upgrades from `0.10.0`,
      `0.11.0`, `0.11.1`, `0.11.2`; the Installed-apps row; silent paths and exit codes)
- [ ] 5.3 Tag `v0.11.3` on a commit whose runs are green with every job RAN; the draft read back, sums checked;
      `v0.11.2`, `v0.11.1`, `v0.11.0` titled "— superseded, do not use (unsafe with a backup engine)"; NOT published
