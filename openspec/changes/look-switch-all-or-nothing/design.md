# Design — look-switch-all-or-nothing (`LOOK-SWITCH-01` §0–§3)

Everything below was ESTABLISHED on 2026-09-27; nothing in §0 changed any code. Anchors are to this tree unless
a CasparCG source path (`src/…`, stock `v2.5.0-stable`) is named.

## §0.1 Today's AMCP order for a 1 → 2 box look switch (measured on the fake, 2026-09-27)

Driven through `CasparRuntime.setActiveLook` against `@cg/amcp-mock` with its NDJSON wire trace, the hold at
its production value (`lookMixerHoldMs: 40`), a template with look `one` (plate `live-1` full frame) and look
`two` (`live-1` left half, `live-2` right half), both plates on DeckLink inputs (`decklink` is holdable). The
probe was a throwaway test; the lines below are its output, times relative to the first line of the switch.

**A — the ordinary switch: the new plate was pre-seated at the take and HELD** (ledger after take:
`live-1@30 DECKLINK DEVICE 1`, `live-2@31 held DECKLINK DEVICE 2`):

```
+  0 ms  CG 1-60 UPDATE 0 "{\"__cg\":{\"look\":\"two\"}}"      ← the page is told first (B-174)
+ 54 ms  MIXER 1-30 FILL 0 0 0.5 1 DEFER                     ← after the one-frame hold
+ 54 ms  MIXER 1-30 CLIP 0 0 0.5 1 DEFER
+ 54 ms  MIXER 1-31 FILL 0.5 0 0.5 1 DEFER
+ 55 ms  MIXER 1-31 CLIP 0.5 0 0.5 1 DEFER
+ 55 ms  MIXER 1-31 VOLUME 0 DEFER                          ← leaving HELD: its intent, re-asserted
+ 55 ms  MIXER 1 COMMIT                                     ← one frame: every box moves together
```

No `PLAY`: the union pre-seat (`reconcileLivePlates`'s `'already-live'` plan) seated every look's inputs at
the take, so a switch is pure `MIXER` (`caspar-runtime.ts` `#applyLivePlatesUnguarded`, the `seatUnchanged`
branch).

**B — the new plate was NOT seated** (its pre-seat `PLAY` was refused at the take and the preset dropped —
`#applyLivePlatesUnguarded`'s "A PRESET MUST NEVER FAIL THE ACTION THAT WAS NOT ABOUT IT"):

```
+  0 ms  CG 1-60 UPDATE 0 "{\"__cg\":{\"look\":\"two\"}}"
+ 41 ms  MIXER 1-30 FILL 0 0 0.5 1 DEFER
+ 41 ms  MIXER 1-30 CLIP 0 0 0.5 1 DEFER
+ 41 ms  PLAY 1-31 DECKLINK DEVICE 2                        ← NOT deferred: live at the next tick
+ 41 ms  MIXER 1-31 VOLUME 0 DEFER                          ← its mute, fill and clip are staged…
+ 41 ms  MIXER 1-31 FILL 0.5 0 0.5 1 DEFER
+ 42 ms  MIXER 1-31 CLIP 0.5 0 0.5 1 DEFER
+ 42 ms  MIXER 1 COMMIT                                     ← …and only land here
```

**C — `B-273`: the new plate is not seated and its `PLAY` is refused:**

```
+  0 ms  CG 1-60 UPDATE 0 "{\"__cg\":{\"look\":\"two\"}}"      ← the page starts punching two holes
+ 42 ms  MIXER 1-30 FILL 0 0 0.5 1 DEFER
+ 43 ms  MIXER 1-30 CLIP 0 0 0.5 1 DEFER
+ 43 ms  PLAY 1-31 DECKLINK DEVICE 2                        ← 404
+ 43 ms  MIXER 1 COMMIT                                     ← B-198: a failed batch is not left staged
+ 43 ms  MIXER 1-30 FILL 0 0 1 1                            ← B-166 rollback, un-deferred
+ 44 ms  MIXER 1-30 CLIP 0 0 1 1
+ 44 ms  CG 1-60 UPDATE 0 "{\"__cg\":{\"look\":\"one\"}}"      ← the page is put back
```

**Where `B-273`'s frames come from.** Two terms, both visible above:

1. **The hole.** From the page's first paint after `+0 ms` until its first paint after `+44 ms`, the page
   punches look `two`'s second box and nothing of ours is behind it — the hold (one channel frame), the
   refused `PLAY`'s round trip, the commit, the restores, and the re-tell's own page latency. On the plant
   that is the page's paint lag twice (1–3 fields each, `SKEW-COUNT-01`) plus the hold: a few frames.
2. **Plate 1 moves and comes back.** Its staged left-half `FILL/CLIP` is committed by the failure path's
   `COMMIT` and then restored un-deferred: for at least one tick the surviving box is on the new geometry.

Case B shows a third hazard the switch shares with every seating path today: the `PLAY` is not deferred and
its `VOLUME/FILL/CLIP` are, so for every tick between the `PLAY` and the `COMMIT` the new producer renders at
whatever mixer state layer 31 already had — CasparCG keeps that state per LAYER (fact 4). A layer never
touched is full frame, opaque, at full volume.

## §0.2 Which of the new look's plates are already seated

The applier decides it plate by plate: a placement whose producer already has a record on the same layer
(`priorByProducer`, keyed on the producer) is `seatUnchanged` and gets only `MIXER` lines; every other
placement is a re-seat and gets `PLAY` + `VOLUME` + `FILL` + `CLIP` (`#applyLivePlatesUnguarded`).

On a live row the union pre-seat seats **every** look's inputs at the take, and a plate that leaves the
punched look is **held** (seated, muted, parked off-frame) when its producer form allows it:
`canHoldLivePlate` (`tools/caspar-bridge/src/live-plate-release.ts`) answers yes for `route`, `decklink`,
`ndi` and `stream`, no for `media`.

So the pre-seat step must seat exactly the entered look's placements that are **not** `seatUnchanged`:

- a **preset dropped at the take** (or at an earlier reconcile) because its `PLAY` was refused — the case
  above and `B-273`'s own;
- a **`media` plate released** when it left an earlier look (`canHoldLivePlate` → false);
- in general, any placement whose producer the ledger does not hold on that layer. (A source swap on a
  parked plate re-seats it through the `'live'` reconcile at once, so it is not one of these.)

Held plates need nothing — their producer is running; only their `FILL/CLIP` and volume move, inside the
switch's one `COMMIT`, exactly as today.

## §0.3 Hiding a plate before the switch

**The pattern (fact 2) holds, against the code and against the stock 2.5.0 source** (`CasparCG/server`
`v2.5.0-stable` = commit `69e8ad55`; paths under `src/`). The fork wins where the two differ; the differences
found are noted.

- **Mixer state is the LAYER's** (fact 4, confirmed): `core/producer/stage.cpp` keeps `std::map<int, layer>
layers_` and `std::map<int, tweened_transform> tweens_` apart (51–52); `STOP` and `CLEAR` touch only
  `layers_` (311, 316, 321); every tick draws a layer through `tweens_[index]` (170, 177), so a producer newly
  `PLAY`ed on a layer inherits whatever transform is there. Only the `MIXER` setters, `MIXER CLEAR` and
  `SWAP … TRANSFORMS` change it.
- **Hidden means invisible and silent:** opacity multiplies down the tree and the kernel draws nothing below
  0.001 (`accelerator/ogl/image/image_kernel.cpp` 116–118); a layer below volume 0.002 is dropped from the mix
  (`core/mixer/audio/audio_mixer.cpp` 88). A producer `PLAY`ed on a layer already at `OPACITY 0` / `VOLUME 0` is
  neither seen nor heard, from its first frame.
- **`DEFER` + `MIXER <ch> COMMIT` is one frame** (fact 2): the deferred list is one per channel
  (`protocol/amcp/AMCPCommandsImpl.cpp` 844, 876–877 — a process-wide static keyed by channel index, so shared
  by every connection and every AMCP port; stock keeps it in the AMCP layer rather than on the stage, which does
  not change the fact), and `COMMIT` applies the whole vector inside ONE stage-executor task (`stage.cpp`
  246–254), on the executor the tick also runs on — so every deferred transform lands between two ticks.
- **The `COMMIT` reply comes after the transforms are installed** (`AMCPCommandsImpl.cpp` 865–869, reply at
  `AMCPCommandQueue.cpp` 53–55) and take effect from the next produce pass. ⚠ Stock replies `202 MIXER OK`,
  not `202 MIXER COMMIT OK`; failures read `… MIXER COMMIT FAILED`. The bridge already reads the code, not the
  text.
- **`BEGIN…COMMIT` is not same-frame** (fact 1, confirmed with a correction): the batch runs on the GENERAL
  queue and feeds each stage operation to the channel executor one at a time (`AMCPProtocolStrategy.cpp` 262;
  `stage.cpp` 562–564), with the tick as another task on the same FIFO. The stage mutex the batch takes is
  never taken by the tick (`stage.cpp` 59, 409; only caller `AMCPCommandQueue.cpp` 152).
- **`MIXER CLEAR` does not empty the deferred list and resets the WHOLE transform** — opacity 1, volume 1,
  fill and clip full frame (`AMCPCommandsImpl.cpp` 1371–1381; `stage.cpp` 271, 276;
  `core/frame/frame_transform.h` 76–118). So it un-hides and un-mutes a seated hidden plate (fact 5, confirmed).

**How the reveal joins today's window.** Today's switch is `CG UPDATE` (the page's look) → the `B-174` hold of
one channel frame → the `MIXER FILL/CLIP … DEFER` of every moved plate (and `VOLUME … DEFER` for a plate
leaving held) → ONE `MIXER <ch> COMMIT` (§0.1 case A). The pre-seated plates join that set: their
`MIXER <L> OPACITY 1 DEFER` (and `VOLUME <intent> DEFER`) are staged beside the moved plates' fills and land in
the SAME commit. The new boxes therefore appear in the frame the other boxes move — the frame the hold aims at
the page's repaint, measured `k = 0` in 100 of 100 runs under `single-clock-look-switch` — rather than at the
`PLAY`, which today puts the producer on air at the layer's previous transform before the commit (§0.1 case B).
Nothing about the page's order, its `UPDATE` payload or the hold changes.

**Today's "seated, muted, idle" mechanism for held plates** is NOT opacity: it is `MIXER <L> VOLUME 0 DEFER`
plus a PARK — `FILL` at origin (2, 2), off the raster, with `CLIP` full frame (`live-plate-release.ts`
`parkedFit`; the release loop in `#applyLivePlatesUnguarded`). **It survives fact 4 in one direction and not the
other.** It is layer state, so it survives a `STOP`/`CLEAR` of the producer and a new producer on the layer
inherits it (a producer `PLAY`ed onto a parked layer is off-raster and muted, i.e. hidden). It does NOT survive
a core restart: `tweens_` resets to opacity 1, volume 1, full frame — and the layers themselves are gone — and
the bridge re-sends no mixer state after a reconnect (§0.4), so a held plate is simply lost until the next take
re-seats it. Nothing on a reconnect can re-reveal it either, because nothing re-seats it.

⭐ **Seating early removes `B-174`'s "producer start" term.** The repo records three switch-artefact terms
apart (`docs/prd/bugs-runtime.md` 7320–7335): (a) the page/mixer skew `k`; **(b) "producer start latency" —
the first-frame latency of a producer the switch had to START: +2 … +4 fields (40–80 ms) for a media clip, 0 when
the producer was already seated** (7326–7331, filed as `B-192`, 8064–8130, table 8091–8094); (c) the outgoing
plate's picture leaving after the new hole opens (7332–7335, `B-193`). `single-clock-look-switch` records that
(b) "survives untouched" (`openspec/changes/single-clock-look-switch/proposal.md` 76–87) and is invisible in its
campaign only because the `ghab3` fixture seats every plate in every look (`tasks.md` 133–137). A pre-seat
starts the producer — its stale first frame and first ticks — hidden, BEFORE the page is told, so the reveal
carries a producer already running: term (b) goes to the recorded pre-seated value, 0.

## §0.4 Every `DEFER` / `MIXER <ch> COMMIT` / `MIXER CLEAR` the bridge sends

The builder is `tools/caspar-bridge/src/command-builder.ts` (not `packages/caspar-client`): `deferMixer`
appends ` DEFER` to a `MIXER` line and passes anything else through; `mixerCommit` is `MIXER <ch> COMMIT`;
`mixerClear` is layer-scoped only, `MIXER <ch>-<L> CLEAR`. No other bridge source spells a `MIXER`,
`CLEAR`, `COMMIT` or `BEGIN` line.

**Not sent anywhere:** a channel-wide `MIXER <ch> CLEAR` (fact 5's first half is already true); `CLEAR <ch>`
(`clearAll` goes item by item through `out`); `OPACITY` (grep: a doc mention only); AMCP `BEGIN…COMMIT`
(`BEGIN` appears nowhere) — so our `DEFER`s and their `COMMIT` already go out outside any batch.

| site (`caspar-runtime.ts`)                                                                                             | sends                                                                      | can it meet a seated hidden plate?                                                                          | can it apply someone else's `DEFER`s?                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `#applyLivePlatesUnguarded` seating loop (take, update, swap, switch)                                                  | `MIXER FILL/CLIP/VOLUME … DEFER` (the `PLAY` un-deferred)                  | yes, by design — it un-holds or seats presets muted                                                         | not a commit (another client's `COMMIT` could land these early)                                    |
| release loop — the hold                                                                                                | `MIXER <L> VOLUME 0 DEFER`, park `FILL 2 2 … DEFER` + `CLIP 0 0 1 1 DEFER` | yes — this IS the hold                                                                                      | not a commit                                                                                       |
| failure path `#commitStagedMixer` (B-198)                                                                              | `MIXER <ch> COMMIT`                                                        | yes                                                                                                         | **yes** — only sent when we staged something (`#stagedMixerChannel`), but a commit is channel-wide |
| successful switch/apply commit                                                                                         | `MIXER <ch> COMMIT`                                                        | yes                                                                                                         | **yes**, same gate                                                                                 |
| `#applyLivePlates` `finally` (B-199) + `#reassertLedgerGeometry`                                                       | `COMMIT`, then `FILL/CLIP` un-deferred                                     | yes                                                                                                         | **yes**, same gate                                                                                 |
| `#flushOrphanedStaging` on the primary's next `healthy` (B-221)                                                        | `COMMIT`, then ledger `FILL/CLIP` per row                                  | yes                                                                                                         | **yes** — only when a commit of ours was recorded undelivered                                      |
| redundancy adapter corrective resend / failover replay (`packages/caspar-client/src/redundancy/redundancy-adapter.ts`) | the journal, verbatim — `DEFER`, `COMMIT` and `MIXER CLEAR` lines included | yes (backup server only)                                                                                    | **yes, ungated** — it enqueues directly, bypassing `#send`                                         |
| `#clearAfterRefusal(…, 'plate')`                                                                                       | `CLEAR <L>` then `MIXER <L> CLEAR`                                         | only a plate THIS action created (`mayClearAfterRefusal`)                                                   | no                                                                                                 |
| end-of-apply clearing sweep                                                                                            | `CLEAR` + `MIXER CLEAR`                                                    | no for a plate meant to stay held (held records are kept in `next`); yes for a `media` plate being released | no — the commit is deliberately placed before it                                                   |
| `teardownLiveLayers` (`stopItem`, `out`, `remove`)                                                                     | `CLEAR` + `MIXER CLEAR` per record                                         | yes — deliberately destroys held plates too                                                                 | no                                                                                                 |
| `#resetEmptiedLayerMixer` (B-253)                                                                                      | `MIXER <L> CLEAR`                                                          | no — bank rows only, after a `CLEAR` acked on the primary                                                   | no                                                                                                 |

**After an AMCP reconnect today:** the handshake (`VERSION`, `INFO`), then — only if a commit of ours was
recorded undelivered — `MIXER <ch> COMMIT` plus each row's ledger `FILL/CLIP` (`#flushOrphanedStaging`); pending
retention restores (`MIXER VOLUME 0`, `CG ADD`); later the sweeps' `INFO` reads and, once per PROCESS, `VOLUME 1`
on the bank rows. **Nothing re-sends our full mixer state** (FILL/CLIP/VOLUME/OPACITY of layers 50–99) on a
reconnect; a full re-seat happens only on a take.

⚠ **One gap, inferred from the code and NOT reproduced:** `#reassertLedgerGeometry` re-sends `FILL/CLIP` but
never `VOLUME`. If a batch dies after staging a returning plate's `VOLUME <intent> DEFER`, the orphan commit
applies the volume and the repair re-parks the picture: a plate hidden but audible at its intent, until a take
re-mutes it. It matters only when the operator raised that plate above 0 (the default intent is 0). Fact 3's
"first `DEFER` set after a reconnect carries the full desired state" would close it; it is §1 work.

## §0.5 What the fake can prove, and what needs a real CasparCG

**The fake proves the WIRE:** the order (every pre-seat `PLAY` reply before the page `UPDATE`); that a refused
pre-seat sends no page `UPDATE` and no `MIXER COMMIT` and nothing to the old look's plates; that
`OPACITY 0` + `VOLUME 0` are committed before every `PLAY`; the reconnect `DEFER` set; the absences pinned here.
`@cg/amcp-mock` records every line (`tracePath`) and tracks per-layer fill/clip.

**It cannot prove FRAMES:** when the boxes appear relative to the page's holes, black and misplaced frames,
and term (b). Those need real CasparCG and `tools/skew-harness`, which records the composited channel through a
`FILE` consumer, drives the real `CasparRuntime` through a wire tap, and classifies the switch window's frames
(`tools/skew-harness/README.md` 3–6, 43–46; `src/run.ts` 900–908). It measured `B-174` on the owner's dev machine,
never on `.114` (`docs/prd/caspar.md` 2231–2234).

⚠ What the harness can and cannot drive today:

- `--fixture ghab` is a 1 → 2 switch whose second plate is NOT in the first look (`src/geometry.ts` 145–155,
  275–282). Its plates are `media` clips only (`src/run.ts` 318–327), which `canHoldLivePlate` tears down, so
  every run after run 00 re-seats the new plate with a `PLAY` inside the switch — exactly the path this change
  is about. `--fixture ghab3` seats every plate in every look (the pre-seated control).
- The harness EXCLUDES a run with a `PLAY` in its window from `k` and from the printed BLACK/MISPLACED table
  (`src/wire-tap.ts` 122–132; `src/run.ts` 652–658); term (b) is computed over those runs. With the pre-seat the
  `PLAY` moves BEFORE the page is told, so the window must start at the page's `CG UPDATE` for those runs to
  count — a harness adjustment that belongs with the §1 build.
- It still uses the pre-2026-09-14 layer map (page on row 9, plates 30–39: `src/run.ts` 309–327). It runs;
  its numbers are on the old layers.
- It sends `SET <ch> MODE` and ends with `CLEAR <ch>` (`src/run.ts` 514–520, 737–742): the owner's own dev
  station only, never a programme channel.

## §3 The measurement, and whether the refusal half is independent

**It is NOT independent, so nothing of §1's switch change ships before the measurement.** Refusing before the
page moves requires knowing the plate is refused before the page is told, which requires seating it first; the
seat must be hidden or it puts a full-frame, audible producer on air before the switch (§0.1 case B, §0.3); and
a hidden seat must be revealed in the switch's commit — which is the new success path. The two halves are one
mechanism.

**The command** — on the owner's own dev station (his CasparCG 2.5.0 with its DeckLink card, on
`127.0.0.1:5250`; **never `.111` or `.114`**), in a PowerShell window at the repository root, with
`pnpm dev:station` stopped if it holds port 5250 and ffmpeg on `PATH`, once the §1 build (with the harness's
window starting at the page `UPDATE`) is on his machine:

```
pnpm --filter @cg/skew-harness build; node tools/skew-harness/bin/cg-skew.mjs --media-dir "D:\programs\casparcg-server-v2.5.0-stable-windows\media" --fixture ghab --from look-ghab-full --to look-ghab-boxes --classify --runs 10
```

(Run the same line today, before the build, for the baseline; `--fixture ghab3` is the pre-seated control.)

**What the numbers must read**, against `B-174`'s record (`docs/prd/bugs-runtime.md` 6646 ff.):

- `k` = 0 fields in every run, runs 01–10 INCLUDED (today they are EXCLUDED as `PLAY` runs). The record:
  20 / 30 / 60 ms before the hold, −20 / 0 / +20 ms after it, 0 in 100 of 100 under single-clock.
- BLACK 0 % and MISPLACED 0 % in both directions — the single-clock record for the pre-seated form, now required
  of the freshly seated form too.
- Term (b), producer start: **0 fields** (today +2 … +4 fields, 40–80 ms, for a freshly started media clip —
  `B-192`).
- The CONTROL settled-frame count ≈ 0, as every harness run requires.

## §1 The build this change will make, after the measurement (not built)

- **The pre-seat step** (a new, named step inside `setActiveLook`, before `beforeApply`): for each placement of
  the entered look that is not `seatUnchanged` (§0.2): stage `MIXER <L> OPACITY 0 DEFER`, `VOLUME 0 DEFER` and
  the target `FILL`/`CLIP … DEFER`; one `MIXER <ch> COMMIT` and wait for its reply; then `PLAY` and wait for its
  reply. All before the page is told anything. `ROUTE-PLATES-01`'s `LOADBG` → `PLAY` pair (≥ 40 ms, ≤ 200 ms)
  goes in that one named place.
- **On any refusal:** undo only the plates this step seated, through `mayClearAfterRefusal`
  (`tools/caspar-bridge/src/refusal-cleanup.ts` 46); send no page `UPDATE` and no switch `COMMIT`; the row keeps
  its old look and shows the `FIELD-FIXES-01` A/B line. ⚠ **A premise correction:** the prompt's §2 expects
  "plate 2's layer is cleared, because this switch seated it". Under that one rule a `PLAY` the server REFUSED
  seated nothing and its layer is not cleared (the refusal left it as it was); a plate whose `PLAY` LANDED
  before another plate refused IS cleared. The tests will assert the rule, not the sentence.
- **On success:** today's sequence, unchanged, with each pre-seated plate's `OPACITY 1 DEFER` (and its volume
  intent) in its one `MIXER <ch> COMMIT`.
- **Hide before `PLAY` on every seating path** (take, switch, swap, restore — fact 4): `OPACITY 0` + `VOLUME 0`
  committed before the `PLAY`, the reveal in that action's commit.
- **`DEFER` hygiene:** after every AMCP reconnect the first `DEFER` set re-sends the full desired mixer state of
  our own layers (50–99), never 1–49 — which also closes the hidden-but-audible gap in §0.4.
- Already true and now pinned: no `MIXER <ch> CLEAR`; no `BEGIN…COMMIT`.
