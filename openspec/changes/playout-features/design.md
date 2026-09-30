# playout-features — design

`PLAYOUT-FEATURES-01` (v1). Anchors are `tools/caspar-bridge/src/caspar-runtime.ts` (`RT`) unless named, at
`a8b59df5` (the change's base); line numbers move as the change lands, so each is named by its function too.

## §0 — what was established first

**§0.1 — the send guard before this change** (`amcp-guard.ts`, `amcpLineRefusal`). It refused `CHANNEL_GRID`,
`CLEAR ALL`, `SWAP`, `SET … MODE`, consumer `ADD`/`REMOVE`, any targeted verb on an undeclared channel, a
channel-wide `CLEAR`, a `CLEAR <ch>-<L>` outside 50–99 unless the station's own configuration declares L,
`PAUSE`/`RESUME`/`CALL` on a coordinate holding no clip of ours, a channel-wide `MIXER CLEAR` and a
`MIXER <ch>-<L> CLEAR` under a seated plate, and a Playout `route://H` with no layer. **It did NOT refuse
`PLAY`, `LOAD`, `LOADBG`, `STOP`, `MIXER` or `CG` to a layer below 50** — only `CLEAR` was layer-checked. So
the prompt's "our guard already refuses anything outside 50–99" was true of `CLEAR` alone. Part C closes it
(decision C3). It never inspected a `route://` target's own coordinate, which is a READ and stays allowed.

**§0.2 — the route reveal's timing** (`route-plates.ts`). `ROUTE_REVEAL_AFTER_PLAY_MS = 80`, a fixed wall
clock from the last route `PLAY`'s reply (`sleepUntil(#routeClock, lastRoutePlay + …)` in
`#applyLivePlatesUnguarded`), described as "two ticks of 25 fps". A `PLAY` takes effect no later than the
tick after its reply, and the reveal's `COMMIT` no sooner than the tick after it is sent, so the gap between
the two effects is at least 80 ms − one tick: one full tick at 25 fps (40 ms) and at 29.97 fps, but **short of
one tick below 25 fps** (24/23.98 fps: 41.7 ms, so 80 − 41.7 = 38.3 ms). Part C makes the wait
`max(80 ms, 2 frames of the route's video mode)` (decision C4).

**§0.3 — the backup's path** (`B-286`). `RedundancyAdapter.send` sends ONE line to both servers under
`mirror-sync` (`Promise.allSettled([primaryQ.enqueue(line), backupQ.enqueue(line)])`), `mirror-async` enqueues
the same line on B, and the journal keeps that one line for a failover replay (`replayJournalTo`) and a
corrective resend. The bridge reads ONE Playout — its D4, D10 and D11 — and never the backup's.
`SendOptions.mirror: false` is the one exception (primary only, never journaled). `B-286`'s own anchors
(`redundancy-adapter.ts:250-253`, `:195-199`, `:492-503`, `connections.ts:306-311`) had moved with
`c8626f4b`; at the base they are `redundancy-adapter.ts:254-257` (the fan-out), `:199-203` (the failover
replay), `:515-526` (`replayJournalTo`) and `connections.ts:309-318` (`ServerEndpointSchema`).

**§0.4 — `B-292`'s silence check against a per-channel tick error.** The Playout's §1.5: an internal tick error
on a channel clears all its layers with no process restart and no `epoch` change. `silentLayersToAsk`
(`silent-layer-question.ts`) asks `INFO <ch>` for a layer we hold on air that has been silent for
`SILENT_LAYER_MS` (1 s) while the channel's own OSC still arrives (`CHANNEL_TICKING_MS`); an empty answer
takes the row off air with the notice. A tick error leaves the channel ticking (the next tick runs), so the
channel's OSC continues and our emptied layers go silent: the same path as a foreign `CLEAR`, which
`media-plates.integration.test.ts` measures. **Covered**, with nothing to add; the playlist box is one more
plate on it.

## D — the CG license (`R-077`)

1. **A reader of its own, not D4's** (`playout-license.ts`). D4's reader goes ABSENT on any failure — a stale
   label is a lie. A license that read "not licensed" does not become licensed because the Playout stopped
   answering, so this reader KEEPS its last value (D9's rule, as their §3.3 asks). `404` is "not served" — CG
   Control off in the Playout, or a Playout before `2.9.2` — and reads `null`: nothing is refused for it.
2. **Its URL is derived from D4's** (`playout292Url`), not a new configuration key: the license and the meters
   are served by the same Playout under the same authentication, so a station configured by address and one
   configured by issuer both reach them with no configuration change.
3. **The ONE predicate** is `cgUnlicensedReason(license, cgLicensed, channel)` in `@cg/shared-ipc`: the bridge's
   take refusal and the console's strip mark both ask it (golden rule 6). While D4 is unread, the bridge
   falls back to the license's own station-level `channels` list (`joinedCgLicensed`), so a cap does not
   lapse in an outage.
4. **Only a take is refused** (`#takeImpl`, beside `C-048`'s `unlicensed`), with a row record carrying the
   Playout's message (`TakeRefusal.message`, new and optional). `PUT BACK ON AIR` re-takes, so it is refused
   too. A clear, a stop, a removal — and the configuration verbs — are untouched: the agreed rule is "new
   takes are refused; removals still work; nothing is cleared".
5. **`B-292`'s notice names the Playout's own license rule** when D4 reads the channel `unlicensed` as the layer
   is found gone (`ClearedOutsideLayer.cause: 'playout-license'`). That is the Playout's rule, not the CG
   license's; the CG license clears nothing.
6. **The fake Playout** models `licensed` (default), `not_included`, `cap-1` and `grace`, and `null` (before
   `2.9.2`). It does NOT also refuse D1/D2 under `not_included`: a token issued before the license went stays
   valid (their §4), and that — a signed-in console on an unlicensed Playout — is the case the refusal is for.

## B — `ownOutputOf` (`B-298`)

1. **Parsed as optional and joined by D4's rule** (`buildPlayoutSourceCatalog` → `SourceDefinition.ownOutputOf`,
   our channel number). A pair naming none of this station's channels loops on none of them. Absent is
   "unknown", never "safe" — and never inferred from the NDI name.
2. **One predicate, `sourceLoopsOn`**, beside `sourceShowableOn` rather than folded into it: the words differ
   (`Own output of CH n (would loop)` against `Not available on CH n`), and a row's line reads its code as
   recorded (`source-own-output`), never the entry's current state.
3. **Three bridge doors ask it:** the take's resolver (`resolvePlateAssignments`), the seating filter in
   `#planLiveSeating`, and `#refuseBindingChange` — the door a swap and an UPDATE pass. The last was needed:
   for a plate already on air the planner never asks the resolver, and a swap to a looping input was
   accepted (`ok: true`) with nothing sent. Measuring that found the same hole for rule 1 — `B-299`.
4. **`B-299` — the binding door asks rule 1 too, and both questions only of a NEW or CHANGED binding.** A swap
   to a route the channel may not show was likewise answered `ok: true` with nothing sent and the old seat
   kept (measured). Both refusals now sit in `#refuseBindingChange`, asked of every prospective frame that is
   not already in force (`(look, plate, source)` compared with the maps in force), with the take's clauses.
   An unchanged binding is never refused for a mark or a list change that came after it — so an UPDATE of a
   row's texts is not blocked by the Playout marking its input later.

## C — the playlist output as a box source (`R-075`)

1. **`playlistOf` is kept in the Playout's own numbering, never joined** (`SourceDefinition.playlistOf`). The
   D4-style join (`channelFor`) answers `null` for a channel this station does not declare — which is the
   programme channel a squeeze-back shows — and losing the fact would unlock the box's audio. A `pl-` row
   that lost the field to a malformed value is still locked, by its id (their §1.6 reserves the prefix).
2. **ONE predicate, `isPlaylistOutput`**, asked by the seat, the bridge's refusal of a raise, the guard's
   context and every console audio surface.
3. **Volume 0 is enforced three times, on purpose.** The SEAT writes `intendedVolume: 0` and `audioLocked` on
   the ledger record whatever intent was armed (a plate raised on a camera and swapped to the playlist is
   the measured case — without it the swap carried the raise); every line that reads the record (the reveal,
   an unhold, a reconnect's re-send) therefore sends 0. `setLivePlateVolume` refuses a raise
   (`playlist-audio-locked`) for a seated OR only-bound plate — the one door ON, a fader, SOLO and the batch
   all pass. And the send seam refuses a `VOLUME` above 0 on a locked layer (`amcp-guard-audio-locked`), the
   backstop behind both.
4. **The guard holds every verb to 50–99** (`design.md` §0.1), with the station's own configured layers as the
   one exemption (legacy fixtures; a real station's are the same set); the Playout's playout layer L is
   refused before that exemption is read; a Playout route line with `NEXT`, `BACKGROUND` or `BUFFER` is
   refused. The whole bridge suite (1,622 tests) passed under the tightened rule unchanged: nothing
   legitimately addresses a foreign layer.
5. **The reveal's wait is two ticks of the route's own rate, never under 80 ms** (`routeRevealDelayMs`); a mode
   this does not parse is timed at 23.976 fps, the slowest this product drives.
6. **The picker disables only the playlist row the Playout marks unavailable**; every other unavailable input
   keeps its rule (bindable, tagged), as `runtime-playout-sources` states it.

## A — the backup's own clip (`B-286`)

1. **The lookup is its own module** (`backup-media.ts`), outside the take: the fingerprint of every bound clip
   is asked of the BACKUP Playout's D11 (`?fingerprint=`, ≤ 100 a request) on a catalogue change, after
   server B's new connection (`CasparRuntime.onServerConnected` — private, so no console hears it) and every
   30 s; answers are cached by fingerprint; a server-B address change forgets them (`reset`). A take reads
   `lookup()` synchronously.
2. **Only an item's OWN fingerprint counts.** A Playout older than `2.9.1` ignores the filter and answers the
   first page of its library; its items carry no fingerprint, which is how the lookup knows it is old.
3. **The per-server line is keyed to SERVER B, not to the backup ROLE** (`SendOptions.serverB`): after a
   failover B is the primary and must still get its own path. The journal keeps both lines
   (`JournalEntry.lineB`, read by `journalLineFor`), so the live fan-out, the failover catch-up and the
   corrective resend all send each server its own, and an entry B has none of is never replayed to B.
4. **"The backup is never sent a path it has not listed" is total:** no fingerprint, no copy, an old backup, or
   an unread list — B is sent nothing for that plate, and while B is the primary the seat is refused
   (`backup-no-copy`). A clip's transport verbs to such a seat go to the primary only (a `CALL` to an empty
   layer is not something to send the Playout's core). The row's line comes from the ledger record
   (`backupRefused`, persisted) and is published per plate (`StackItemState.backupNoCopy`).
5. **Auth off** — no Playout, no lookup — a clip's `PLAY` mirrors as before: there is no list for B to be held to.
6. **Open, for the Playout team:** the lookup uses the bridge's own bearer, the primary Playout's. Whether a
   backup Playout (its own install, its own keys) accepts it is unknown; if not, every clip stays empty on the
   backup and says its list could not be read.
