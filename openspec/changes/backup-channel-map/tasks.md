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

- [ ] 1.1 `RedundancyAdapter`: `serverBLine` required with a server B; every road to B — fan-out, primary-only while
      B is primary, failover catch-up, corrective resend — asks it; a refused line is sent nowhere and is no
      divergence; server A's line untouched
- [ ] 1.2 `OscTransport.setChannelMap` (core channel → station channel or none), before every tap;
      `setServedChannels` a wrapper of it
- [ ] 1.3 Tests: the adapter's roads to B each translated (and the control: A's line byte-identical); the OSC map

## 2. Translation, guard and mapping (`tools/caspar-bridge`)

- [ ] 2.1 `server-b-line.ts`: `translateForServerB` and `serverBLineRefusal` (the guard), pure; unit tests over every
      line shape the builder emits, `route://`, channel-free lines, unknown verbs, a planted verbatim line
- [ ] 2.2 D4 row schema: `mirrorOf` (lenient); `mirrors` deliberately not read
- [ ] 2.3 `backup-channels.ts`: the Playout's rule, the entry check, disagreement, validity, B's D4 freshness (30 s),
      A's last good rows, held-until-next-take; unit tests for every D4 shape the prompt lists
- [ ] 2.4 `backup-channels-store.ts`: entries stamped with server B, durable write, restart and upgrade kept
- [ ] 2.5 The runtime: `serverBLine` into both adapter constructions; B's OSC and clears mapped back; the start check
      on B mapped; `#send`'s refusal while B is the primary (`backup-unmapped` / `backup-route` / `backup-guard`);
      `take`'s refusal in words; `release` at a take; `holdsLiveLayersOn`; `serverBVerbatim` (TEST-ONLY)
- [ ] 2.6 The bridge: the resolver wired (A's catalogue, the backup engine's catalogue + re-read at sign-in and on
      B's reconnect, entries, config); `backupChannels.state` / `.changed` / `.set-entries` (station-admin, lock,
      audit); `/health` per-server `channels`; `B-313`'s guard compares M
- [ ] 2.7 The fake pair: B's core 5 channels (1 its own programme, 2 and 3 the mirrors, 4 and 5 previews); B's D4
      with `mirrorOf`; A's D4 with `videoMode` and `mirrors`; the dev station's banner
- [ ] 2.8 The decisive control (integration, the real bridge, the fake pair): a take, an UPDATE, a look switch, a swap,
      a clear, a `CLEAR ALL`, a restore and a failover catch-up on A's CH 1 — core B's recorded wire holds only
      `2-…` lines; the same test red on the pre-change seam (it sends `1-…` to B)
- [ ] 2.9 An unmapped channel (A airs, B's wire empty; after a failover the take refused in words); a mapping change
      while live; A's wire line for line against `0.11.2`'s; the existing pair tests given explicit mappings

## 3. The console (`apps/runtime`)

- [ ] 3.1 The status bar's `BACKUP B · n of m channels mapped`; the channel view's backup line; the PROGRAM pane's
      `Not available on the backup engine` while B is the primary
- [ ] 3.2 Station setup → Servers → `Backup engine`: one line per declared channel, the entry and its state
- [ ] 3.3 Part D: the password line in the Playout team's words inside `<bdi>`; the AMCP-pending line says what to do
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
