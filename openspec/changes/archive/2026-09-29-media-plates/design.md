# media-plates — design

Prompt: `MEDIA-PLATES-01` (v2), run inside `DAY-RUN-02` (v2). PRD: `R-071` (`docs/prd/runtime.md`). It builds
on `LOOK-SWITCH-01` (the one seat step: hide → `PLAY` → reveal in one commit), `PLAYOUT-SOURCES-01` (the store
of bound media) and `ROUTE-PLATES-01` (a held route hidden with `OPACITY 0`; the send-seam guard).

## §0 — Established first

Anchors are to this change's tree unless a commit is named. CasparCG sources are 2.5.0 (`v2.5.0-stable`).

### §0.0 — The core facts `LOOK-SWITCH-01` built on apply unchanged

Hide with `OPACITY 0` before every `PLAY`; mixer state belongs to the layer number; one `MIXER <ch> COMMIT` is the
only same-frame tool; never `MIXER <ch> CLEAR`, and never `MIXER <ch>-<L> CLEAR` under a seated plate (the
send-seam guard, `tools/caspar-bridge/src/amcp-guard.ts:113`, refuses both). Nothing here changes any of them.

### §0.1 — How a held plate is hidden today, and where hold and unhold sit

- **The hold** is the release policy at the foot of `#applyLivePlatesUnguarded`
  (`tools/caspar-bridge/src/caspar-runtime.ts:9353`, `releaseLivePlate`): the mute
  `MIXER <ch>-<L> VOLUME 0 DEFER` (:9394), for a Playout route also `OPACITY 0 DEFER` (:9408), and the park
  (`FILL 2 2 w h` + `CLIP 0 0 1 1`, both `DEFER`, :9437) — all staged into the switch's one
  `MIXER <ch> COMMIT` (:9485), after the arriving plates' lines. `B-174`'s order puts the page's `CG UPDATE`
  before this batch.
- **The unhold** is in the applier's per-plate `lines` for a seat whose record is `held` (:8743–8777): the fit
  back, its declared volume, and `OPACITY 1` for a hidden one — staged, and applied by the same commit.
- **So `PAUSE` and `RESUME` go into that same batch**, as close to its commit as a non-`MIXER` verb can be
  (neither can be `DEFER`red): `PAUSE` right AFTER the commit that hid the clip (:9488 — sent before it, a
  `PAUSE` would freeze a clip still on screen), `RESUME` as the LAST line of the returning plate's staged lines
  (:8777), so it runs hidden for as little as the batch allows before its reveal is committed.

### §0.2 — 🔴 What 2.5.0's ffmpeg producer shows when a clip that is not looping ends: its LAST FRAME

- **From the source.** At end of file the producer stops decoding (`av_producer.cpp:897–903`: `buffer_eof_`;
  with `loop_` it seeks to the start, otherwise it idles), and `receive` answers
  `core::draw_frame::still(frame_)` — the last frame, held (`av_producer.cpp:1051–1057`). Its state keeps
  reporting `file/time` at the clip's length (`:1007`).
- **Measured on the owner's CasparCG 2.5.0** (`127.0.0.1:5250`, channel 1, layer 90, `INFO 1` saved and
  unchanged after): a 4 s clip read `4.00/4.00` 1.5 s and 3 s after its end, producer still `ffmpeg`.
- **Squared with the old comment.** `live-plate-release.ts` said a held clip "runs to its end and comes back
  black", and every clip was torn down for it. It does not come back black; the comment is corrected in place
  (`live-plate-release.ts:31`), and the tests that quoted it are re-expressed.
- **Mechanism: none is needed.** Nothing is sent at the end of a clip; the freeze is the producer's own. So §1.B
  is only `PLAY … LOOP` when Loop is on.

### §0.3 — On 2.5.0, from the source (and measured)

- **`PAUSE`/`RESUME` hold the frame:** a paused layer draws nothing new and falls back to the producer's
  `last_frame` (`layer.cpp:126–129`; `pause()`/`resume()` at `:50–52`). Measured: `0.86/4.00` held for a
  second paused; `1.70/4.00` a second after `RESUME`.
- **Restart: `CALL <ch>-<L> SEEK 0`, then `RESUME`.** `SEEK` is in the producer's `call`
  (`ffmpeg_producer.cpp:171–184`), in frames at the channel's field rate, and works on a clip frozen at its end
  (measured: `201 CALL OK`, then playing). It is cleaner than a fresh `PLAY`: no new producer, nothing re-seated,
  no hide and reveal. `RESUME` after it plays a clip that was paused; on a playing clip it is a no-op.
- **`CALL <ch>-<L> LOOP 1|0` switches looping on a playing clip** (`ffmpeg_producer.cpp:142–147`); measured, a
  looping clip seeked past its end was at `0.70/4.00`. `PLAY … LOOP` is a bare flag
  (`ffmpeg_producer.cpp:303`, `contains_param`), so `LOOP 0` would loop too — the bridge never writes a value.
- **The time and length:** OSC `/channel/N/stage/layer/L/foreground/file/time` — `[elapsed, length]` in seconds
  (`av_producer.cpp:1007`), and `…/foreground/paused` (`layer.cpp:134`).

### §0.4 — `PLAYOUT-SOURCES-01`'s bound-media store has landed

`BoundMediaItemSchema` (`packages/shared-ipc/src/playout-sources.ts:238`) persisted as
`bridge-bound-media.json` by `PlayoutSources` (`tools/caspar-bridge/src/playout-sources.ts`). The two settings go
there, and the catalogue carries them (`buildPlayoutSourceCatalog`, `:462`).

### §0.5 — Every caller of `canHoldLivePlate`

One: `releaseLivePlate` (`live-plate-release.ts:276`), called once, from the release policy
(`caspar-runtime.ts:9353`). The mock, the renderer and `@cg/shared-ipc` mention it only in comments (the mock is
told NOT to model it; the console reads the bridge's release sentence rather than re-deriving it). What changes:
the call now passes the catalogue ENTRY (so a clip's `whenHidden` travels with the producer form), and a held
clip is hidden, muted, parked and — for `pause` — paused. The release sentence travels to the console on
`liveLayers.plate-released`, so the `Cleared` pill's sentence was updated with it.

### §0.6 — Band capacity

A held seat stays in the ledger, so its layer is excluded from the free set exactly as a held live input's is:
`#planLiveSeating` allocates around every layer the ledger holds (`allocateLiveLayers`, `caspar-runtime.ts:6290`),
and a band with no room refuses with `live-source-no-layer` (`LIVE_PLATE_NO_LAYER`,
`tools/caspar-bridge/src/live-plate-seating.ts:26`; the refusal at `caspar-runtime.ts:6302`). Test:
`media-plates.integration.test.ts` §0.6 — a held clip and a held input are refused alike; a `restart` clip frees
its layer.

## Decisions

- **Where the settings live.** On the bound-media reference (`loop`, `whenHidden`), written by the store's one
  writer (`PlayoutSources.setMediaPlayback`), republished on the catalogue's `media` sub-object and read everywhere
  through ONE reader, `mediaPlaybackOf` (`packages/shared-ipc/src/channels/sources.ts:392`). A reference bound
  before the settings existed reads as the defaults; a re-read from the Playout keeps the settings (it refreshes
  what the Playout owns, never what the station set).
- **`canHoldLivePlate` keeps its exhaustive switch**, and a second exhaustive switch answers a clip from its
  `whenHidden` — so a new form or a new value is a compile error at the one place the question is asked.
- **One predicate says which held seats are HIDDEN** (`hiddenWhenHeld`: a Playout route or a clip). The hold, its
  reveal, the switch's rollback and the reconnect re-send all ask it, so a live input's wire stays exactly as it
  was.
- **The ledger records the clip's transport AS SENT** (`LiveLayerRecord.transport`: the loop it was played with,
  and who paused it). `hidden` is the hold's pause, taken back by a look showing it; `operator` is the operator's,
  which no look undoes. A refused `PAUSE` leaves it absent and is retried by the next reconcile that still holds
  the clip.
- **A preset clip set to `pause`** (bound only in a look nobody is showing at the take) is seated hidden like
  every preset and then paused after the take's commit, so it waits at its first frames for the look that shows
  it.
- **The remaining time is the server's report only.** A passive OSC tap (`OscClipTimeTap`) keeps each layer's last
  `file/time`; the bridge publishes `liveLayers.media-state` when what a console shows would change (a whole second,
  a pause, an end) from a 250 ms look at the tap. No report within the OSC freshness window, no number.
- **The transport verb** is operator-class, scoped by the row's channel through the gate every item verb uses,
  refused under the lock, and audited with the clip's NAME (`media-transport`). `sources.set-media-playback` is
  operator-class too — how a clip plays is the operator's, like a volume — audited as `set-media-playback`.
- **`PAUSE`, `RESUME` and `CALL` reach only a seated clip of ours, enforced at the one send seam**
  (`amcp-guard.ts`, `clipOn`), not only by the call sites. The Playout's core team recorded why it matters on
  their core: a `CALL` to a DeckLink, NDI or route producer gets no reply and holds every channel's AMCP for 5 s,
  and a `SEEK` can freeze a live stream for good (`PLAYOUT-DESIGN-INPUT-HOLDER-v1.md` §8 #2); and a route is never
  paused (contract v1.3). The ledger is therefore written before a take's `PAUSE`s, so a preset clip it just
  seated is already named when the seam asks.
- **Their other caution is met by the order.** After `PAUSE` a producer still plays about two frames of the pause
  moment at full volume (`PLAYOUT-CG-RESPONSE-V13-STATE-v1.md` §3 — measured for routes): the clip's `OPACITY 0`
  and mute are committed BEFORE its `PAUSE`, so those frames pass hidden and silent. No `CALL` is ever put inside
  a `BEGIN…COMMIT` (none is used here).

## Choices made (the smaller, safer option, where the prompt left one)

- **`Loop` is the shared `Checkbox`.** There is no switch primitive; adding one is a design-system change beyond
  this item.
- **`Paused` shows for any paused clip** (hidden or the operator's), not only a hidden one: it is the truth either
  way, and one fact reads one way.
- **A `restart` clip preset by a look nobody is showing is seated at the take as before** (the union pre-seat is
  unchanged — a hard stop), so until a look hides it for the first time it behaves as it always did.
- **A reference seated before this change** (a clip on air across the upgrade) carries no transport record; it is
  held muted and parked but neither hidden nor paused, until its next take. Not worth a migration.
- **The skew harness pins its clips to `restart`**, so a new run measures the same switch as the evidence it
  already holds.

## The owner's decisions on the open questions (2026-09-28, `FOLLOWUPS-01` D — recorded, no code change)

- **`Loop` stays a checkbox** — the first choice above stands as the decision.
- **A clip on air across the upgrade gets its transport record at its next take** — the fourth choice above stands:
  no migration.
