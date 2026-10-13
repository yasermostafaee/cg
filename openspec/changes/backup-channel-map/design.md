# backup-channel-map — design

## The seam

`RedundancyAdapter` is the one place every line leaves for a server: the live fan-out (`sendMirrorSync`,
`sendMirrorAsync`), the primary-only sends (`sendPrimaryUnjournaled`), the failover catch-up (`replayJournalTo`)
and the corrective resend (`triggerCorrectiveResend`). Each asks one private function for "server X's own line":
`journalLineFor` (B's clip path, `B-286`) and then, for server B only, the injected `serverBLine(line)`. The
adapter knows no AMCP grammar; it requires `serverBLine` whenever a server B is declared — a constructor without
it throws, so no road to B can exist without the translation.

`serverBLine` is the runtime's, and composes two pure functions from `server-b-line.ts`:

1. **translate** — `route://` anywhere: refused. A channel-free line (`VERSION`, bare `INFO`, `INFO CONFIG|PATHS|
SYSTEM|SERVER|THREADS|QUEUES`, `OSC SUBSCRIBE|UNSUBSCRIBE <port>`): unchanged. A targeted verb (`PLAY`, `LOAD`,
   `LOADBG`, `STOP`, `CLEAR`, `PAUSE`, `RESUME`, `CALL`, `MIXER`, `CG`, `INFO`) whose token 1 is `N` or `N-L`:
   that token becomes `M` or `M-L` with `M = channelOnB(N)`; `null` → refused. Anything else: refused.
2. **guard** — the line about to be sent to B, judged alone: a known verb; its channel one of B's mirror channels
   in force (`stationChannelOf(M) !== null`); a layer in 50–99 or the station's own configured layer; a
   channel-only line only as `MIXER M COMMIT` or `INFO M`; no `route://`. The guard does not trust the translator:
   a planted verbatim line (`serverBVerbatim`, a TEST-ONLY fault injector that skips step 1) is refused by step 2.

Server A's line is never passed through either function while A is the primary. After a failover the primary is
B, and every line to it — mirrored or primary-only — goes through `serverBLine` the same way; the runtime checks
first (`#send`) so a refusal is answered with a code (`backup-unmapped`, `backup-route`, `backup-guard`) instead of
a thrown error, and `take` refuses an unmapped channel in words before anything mutates.

## The mapping (`backup-channels.ts`)

Inputs, all read where they already are: the declared channels; A's D4 rows (the primary's catalogue reader,
rule 9 at A's host) — the last good answer is kept, because a failover is exactly when A's D4 cannot be read and
the mapping must hold; B's D4 rows (the backup engine's own catalogue, its own token, rule 9 at B's host) — valid
while its last good read is under 30 s old, so one missed poll does not drop a live mapping while a backup whose
list cannot be read stops receiving within half a minute; server A's and server B's hosts; the primary engine's
API host; the station admin's entries.

For channel N: A's row is the row on server A's host with `casparChannel` N (its `id` X, its `videoMode`). B's
rows with `mirrorOf.id === X` are R. Of R, a row whose `mirrorOf.playout` names A — its host, parsed with or
without a scheme or a port, compared case-blind to the primary engine's host — matches; a row whose `playout` is
empty matches only when R has exactly one row. Exactly one match → that row; zero or more → no mapping. The row
must then be on server B (its rule-9 host), share A's `videoMode` (both known), and carry `cgLicensed: true`. A's
`mirrors[]` is NOT parsed: it is never the reference, and a field that is not read cannot be used.

An entry `N → M` is checked against B's D4: a row with `casparChannel` M on server B, A's `videoMode`,
`cgLicensed: true`, and not the declared mirror of another primary channel. Two entries naming one M are both
refused. With both sources: equal → mapped; different → no mapping, said. Entries are kept in
`bridge-backup-channels.json` beside the connection file, stamped with the server B (`host:amcpPort`) they were
made for; an entry made for another server B is not used, and is said.

**In force vs resolved.** The resolver computes each channel's resolved M on every input change and every 5 s.
The map in force (`channelOnB`) is the resolved M unless the channel is HELD: a channel whose in-force mapping
disappears or changes to another M while CG holds live layers on it (`holdsLiveLayersOn`) is held — nothing is
sent to B for it, nothing is sent to the old or the new M as clean-up — until its next take (`release`), which
puts the newly resolved M in force (or none). A mapping that appears where none was, or changes while nothing is
live, is in force at once: rows already live reach B at their next take, as after a B reconnect.

## Reads from B

The OSC transport gains `setChannelMap(coreChannel → stationChannel | null)` (`setServedChannels` becomes a
wrapper): every non-health message is re-keyed before the taps, so B's taps, the reconciler (while B is the
primary), R-058's ticks and the clip clock all speak of N. An unmapped B channel is dropped and logged once. B's
acknowledged `CLEAR M-L` is mapped back before `noteCleared`. `INFO` answers are already about N: the line asked
B's M on N's behalf.

## After a failover

The monitors (`pgm-return`, `pgm-audio`, the meters) read the primary ENGINE's host; reading B's channel M at
`9250+M-1` would need the backup engine's feed and meters per channel, which this release does not build. The
PROGRAM pane says plainly `Not available on the backup engine` while B is the primary.

## `B-313`

`drivesCore(health, core, peerHost, ours)` — another CG Bridge drives the core only when its channels on that
core meet ours: B's mirror channels in force for server B, the declared channels for server A. A server row in
`/health` now carries its own `channels` (A: N, B: M); an older `/health` with only the top-level list is read as
before; one with no list at all still counts as driving (the safe side).
