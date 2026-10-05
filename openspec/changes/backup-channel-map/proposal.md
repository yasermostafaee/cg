# backup-channel-map

## Why

`B-316`: CG Bridge sends the backup core (server B) every line it sends the primary (server A), with the
primary's channel numbers. On the Playout, redundancy belongs to a CHANNEL, and a mirror is a NEW channel on the
backup engine with the backup's OWN number — its largest channel + 1 — while the backup's channel 1 is its own
default channel and may be airing another programme (`docs/integration/playout/PLAYOUT-CG-RESPONSE-0112-PAIR-v1.md`
§2). So `PLAY 1-50 …` mirrored verbatim lands on another programme. Every build up to `0.11.2` is unsafe with a
server B configured; none has been delivered. The fake pair never showed it: its backup had the primary's channel
numbers.

## What changes

- **One translation, at the redundancy seam (`R-089`).** Every line bound for server B — the live fan-out, the
  failover catch-up, the corrective resend, and every line while B is the primary — is rewritten from the
  station's channel N to B's mirror M, layers unchanged; with no valid M it is not sent to B at all. Server A's
  line is never touched. No `route://` of any kind reaches B.
- **A send guard for server B.** The final line to B is checked on its own terms: its channel must be one of B's
  mapped mirror channels, its layer in CG's layers (50–99), its shape known. A preview, holder, guard or any
  unmapped channel on B is refused by the guard itself.
- **The mapping, per declared channel:** from B's own D4 (`mirrorOf`, Playout `2.9.5`) by the Playout team's rule
  (§3); or from a station admin's entry in Station setup, checked against B's D4; disagreement is no mapping.
  Valid only with B's `cgLicensed: true`, A's `videoMode`, and B's row on server B (rule 9). Re-read on B's cycle,
  at B's sign-in and B's reconnect; a mapping that changes while the channel is live holds that channel's lines to
  B until its next take, with no clean-up to any guessed channel. The entries are kept with the station.
- **Reads from B mapped back:** B's OSC, its acknowledged clears and its `INFO` answers are taken as the station's
  channel N; a B message for an unmapped channel is ignored and logged once.
- **After a failover:** every send to B uses M; a take on a channel with no mapping is refused in words (`No
backup channel is known for CH N`) with nothing sent; the programme return, sound and meters say plainly that
  they are not available on the backup engine.
- **`B-313`'s guard** compares another CG Bridge's channels with B's mirror channels M (and with A's channels N
  on A's machine), per server where `/health` says so.
- **The console:** the status bar's `BACKUP B · n of m channels mapped`; each channel's own `Backup: CH M on
<host>` / `Backup: not mapped — nothing is sent to the backup`; Station setup's `CH N (primary) → CH M
(backup)` lines; the engine sign-in's password line in the Playout team's words; the AMCP-pending line says
  what to do.
- **The fake pair** gives B its own numbers: B's channel 1 its own programme, A's 1 and 2 mirrored at B's 2 and
  3, and two preview channels.
- **Release `0.11.3`** — the version, the `P-031` floor, the guide's "With a backup engine",
  `CG-BRIDGE-FOR-PLAYOUT.md` at `0.11.3`, a draft; `0.11.2` and earlier marked unsafe with a backup engine.

## Impact

- `packages/caspar-client` — `RedundancyAdapter` (the `serverBLine` seam, required with a server B), the OSC
  transport's channel map.
- `tools/caspar-bridge` — `server-b-line.ts` (translation + guard), `backup-channels.ts` (the mapping),
  `backup-channels-store.ts` (the entries), the runtime, the bridge, `core-guard.ts`, `/health`, the D4 row schema
  (`mirrorOf`; `mirrors` deliberately not read), the fake pair.
- `packages/shared-ipc` — `backupChannels.state`, `backupChannels.changed`, `backupChannels.set-entries`.
- `apps/runtime` — the status bar, the PROGRAM pane, Station setup, the sign-in dialog.
- Wire: server A's lines are unchanged, line for line, against `0.11.2`; server B's lines change channel number.
