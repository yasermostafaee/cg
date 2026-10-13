# Design — look-switch-all-or-nothing (`LOOK-SWITCH-01` §0–§3)

**Where later prompts say "after `LOOK-SWITCH-01` (v2) has landed", they mean this change, landed through
`LOOK-SWITCH-01` (v3).** v2 established §0 and pinned two absences; v3 built §1, measured it on this machine's
own CasparCG and, after its one fix cycle, passed (§3 v3) — then shipped.

§0 below was ESTABLISHED on 2026-09-27 and changed no code; §1 records what v3 BUILT. Anchors are to this tree
unless a CasparCG source path (`src/…`, stock `v2.5.0-stable`) is named.

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

## §3 (v3) — the measurement, run by CC on this machine's own CasparCG (2026-09-27)

**The station (§0.2), checked without changing anything:** `casparcg.exe` (pid 23332,
`D:\programs\casparcg-server-v2.5.0-stable-windows`) owns `0.0.0.0:5250`; `VERSION` → `2.5.0 69e8ad5 Stable`
(stock `v2.5.0-stable`); the connection's far end is `127.0.0.1:5250` — not `@cg/amcp-mock`, not the fake Playout,
not a tunnel; `pnpm dev:station` is not running (no bridge or dev-station process; ports 5280, 7911, 9250 free);
ffmpeg 8.1.2 is on `PATH`. `INFO 1` (saved): `1080p5000`, consumers `system-audio@500` and `screen@600`, no
layers.

⚠ **No DeckLink runs on this channel, and none ever has on this machine.** `casparcg.config` declares
`<decklink><device>1</device>` on channel 1, but every start since 2026-08-24 logs `Decklink drivers not found`
(`caspar_2026-09-27.log`: `decklink_api.h(81)`), `DeckLinkAPI64.dll` is absent and no Blackmagic package is
installed. The repo records it: `docs/prd/bugs-runtime.md` 6917 ("This machine has no DeckLink and no genlock"),
`tools/skew-harness/src/run.ts` 140. There is nothing for the owner to START, and every `B-174` number of record
was measured in exactly this state, so the measurement ran; the premise is corrected here rather than obeyed as a
stop.

⚠ **The owner's workstation was LOCKED during the run** (`LogonUI` running; the only display the `WinDisc`
placeholder). The harness's `SET 1 MODE 1080i5000` re-initialised the screen consumer, which then failed with
`Invalid screen-index: 0`, and its own restore (`ADD 1 SCREEN`) failed the same way: channel 1 lost its local
preview window (`screen@600`) and kept `system-audio`, its mode (`1080p5000`) and no layers. The screen consumer
comes back with `ADD 1 SCREEN` once the session is unlocked (the harness's own restore), or with a restart.

**Baseline, today's code (`a1e31a9c`/`b7f25ecd` runtime), 10 runs each, `1080i5000`:**

| run                                       | `k` (channel frames)                                              | BLACK | MISPLACED | term (b), fields                           | CONTROL settled                                  |
| ----------------------------------------- | ----------------------------------------------------------------- | ----- | --------- | ------------------------------------------ | ------------------------------------------------ |
| `ghab` full → boxes (fresh seat)          | run 00: 0; runs 01–09 EXCLUDED (PLAY in the window), A = B in all | 0 %   | 0 %       | `[0, 4, 4, 6, 6, 6, 6, 6, 6, 6]`, median 6 | runs 01–09: **22.78 %** (the new box, 916 × 515) |
| `ghab` boxes → full (release)             | 0 × 10                                                            | 0 %   | 0 %       | 0 × 10                                     | 0                                                |
| `ghab3` full → boxes (pre-seated control) | 0 × 10                                                            | 0 %   | 0 %       | 0 × 10                                     | ≈ 0.01 %                                         |

The 22.78 % is the fresh-seat defect itself: the new box shows no picture of its own for 4–6 fields after the
switch (term (b)), which the classifier reads outside its narrow A = B window as a settled residue the size of
that box. Evidence: `tools/skew-harness/evidence/2026-09-27-look-switch-01/`.

**After §1 (`bbda71c4`…`326297a0`), first measurement — FAILED on term (b):**

| run                 | `k`                            | BLACK | MISPLACED | term (b), fields                 | CONTROL settled                     |
| ------------------- | ------------------------------ | ----- | --------- | -------------------------------- | ----------------------------------- |
| `ghab` full → boxes | **0 × 10** (every run counted) | 0 %   | 0 %       | `[0, 0, 0, 0, 0, 0, 0, 2, 2, 4]` | 7 runs ≈ 0.01 %, **3 runs 22.78 %** |
| `ghab` boxes → full | 0 × 10                         | 0 %   | 0 %       | 0 × 10                           | ≈ 0                                 |
| `ghab3` control     | 0 × 10                         | 0 %   | 0 %       | 0 × 10                           | ≈ 0.01 %                            |

In 3 runs of 10 the new box was revealed before its media clip's first decoded frame: only one hold separated
the `PLAY`'s reply from the reveal. **The one fix-and-measure cycle:** a plate the switch seated runs hidden for
three holds before the page is told (`PRE_SEAT_PREROLL_HOLDS`, in the hold's own unit; a switch that seated
nothing waits for nothing). Reading the code for it found a race the pre-seat itself opened: its awaits sit
between the plan and the page tell, where an un-gated `out` could take the row off air and the apply would then
reveal the plates and register a ledger for a row with no page (`B-161`'s shape). The same BEFORE → AFTER
re-ask `beforeApply` makes after its hold is now made after the pre-seat and its preroll, and undoes the
pre-seat (`look-switch-all-or-nothing.integration.test.ts`, red first without it).

**After the fix — PASSED:**

| run                 | `k`        | BLACK | MISPLACED | term (b), fields | CONTROL settled |
| ------------------- | ---------- | ----- | --------- | ---------------- | --------------- |
| `ghab` full → boxes | **0 × 10** | 0 %   | 0 %       | **0 × 10**       | **≈ 0.01 %**    |
| `ghab` boxes → full | 0 × 10     | 0 %   | 0 %       | 0 × 10           | ≈ 0             |
| `ghab3` control     | 0 × 10     | 0 %   | 0 %       | 0 × 10           | ≈ 0.01 %        |

Against the baseline: `k` counted in every run (9 were excluded before), term (b) from a median of 6 fields to 0,
the fresh box's 22.78 % residue gone. The switch now lands the preroll and the pre-seat's round trips later than
before when it has a plate to seat; a switch of held plates sends no `PLAY` and is unchanged.

**The refusal run (§3.3) — SKIPPED:** the harness cannot drive it with a fixture alone. Its fixtures carry
geometry and probes only; its sources are a catalog built in `src/run.ts` from the clips it generates, so a
plate naming a missing clip needs a code change. The refusal path is proven on the fake
(`look-switch-all-or-nothing.integration.test.ts`: the page is never told, nothing moves).

**The channel afterwards (§3.4):** `INFO 1` BYTE-IDENTICAL to §0.2's snapshot — after putting back the screen
consumer the first baseline run's `SET MODE` had lost while the workstation was locked, the way the harness
itself does: `ADD 1 SCREEN` → `202 ADD OK`, once the session was unlocked.

## §1 What v3 BUILT (`tools/caspar-bridge/src/caspar-runtime.ts` unless named)

- **THE SEAT STEP (`#seatPlates`) — every producer an action starts is started hidden.** For each seat: stage
  `MIXER <L> OPACITY 0`, `VOLUME 0` and the target `FILL`/`CLIP`, all `DEFER`; ONE `MIXER <ch> COMMIT`, awaited
  (landed = acked on the primary, `B-221`'s gate); THEN each `PLAY`, awaited. A hide that did not land sends no
  `PLAY` at all. It stops at the first REQUIRED seat whose `PLAY` did not land and goes on past a refused PRESET.
  The applier (`#applyLivePlatesUnguarded`) runs it FIRST, before its batch stages a line, for every placement
  that is not `seatUnchanged` — so take, swap, restore and a switch's in-place replace all seat through it — and
  each seated plate's old `PLAY` + `VOLUME` + `FILL`/`CLIP` lines became the REVEAL: `OPACITY 1` and its volume
  as today's code computes it (a parked seat muted, every other its intent — never a fixed 1), plus the fit only
  when the seat was not hidden. The reveal rides the action's one commit. One spelling of "already seated",
  `isSeatUnchanged`, is shared by the applier and the pre-seat. `mixerOpacity` is new in `command-builder.ts`.
- **`ROUTE-PLATES-01`'s named place:** `#startSeatProducer` — the one place the seat step starts a producer; its
  `LOADBG` → `PLAY` pair (≥ 40 ms, ≤ 200 ms) goes there and nowhere else.
- **THE SWITCH'S PRE-SEAT (`#preSeatSwitch`, called by `reconcileLivePlates` before `beforeApply`):** the seat
  step for every entered-look placement and fresh preset the switch would otherwise `PLAY`, BEFORE the page is
  told anything; then, when it seated something, a PREROLL of three holds (`PRE_SEAT_PREROLL_HOLDS`, measured —
  §3 v3) so the producer has its own picture by the reveal; then the BEFORE → AFTER re-ask for a row that left
  the air meanwhile (the pre-seat is undone, `not-live`). On a refused required seat it undoes what it seated through `mayClearAfterRefusal` (a refused
  `PLAY` seated nothing and is not cleared; one that landed is) and answers the refusal with the plate and its
  source: no page `UPDATE`, no further `MIXER COMMIT`. `setActiveLook` records it as the row's `takeRefusal` —
  `FIELD-FIXES-01`'s one line — and answers `refusalOnRow`, so the console raises no banner
  (`lookSwitchBanner`); a switch that lands withdraws the line. A refusal AFTER the pre-seat (the page tell, the
  row leaving air in the hold) takes the pre-seated plates back off (`#undoPreSeat`); a `MIXER` line refused in
  the apply (a defensive path — real 2.5.0 does not refuse a `MIXER` on a layer it owns) clears the plates the
  switch seated as well as putting the fills back (`B-166`).
- **After every AMCP reconnect (`#resendLiveMixerState`)**, on the primary's first `healthy` of a NEW connection
  and after `B-221`'s orphan flush: each row the ledger holds, under its seat lock, re-sends `FILL` + `CLIP` as
  recorded, the volume as today's code computes it (held or parked → 0, else the recorded intent, which a landed
  silence has already lowered) and `OPACITY 1`, all `DEFER`, then that row's one `MIXER <ch> COMMIT` — only for
  layers in CG's bands (`isInCgBands`, 50 up), never 1–49. That closes §0.4's hidden-but-audible gap.
- **A plate layer's `MIXER CLEAR` only once its `CLEAR` landed (`#resetPlateMixerIfCleared`)**, at the three
  sites §0.4 found can meet a seated plate: the refusal clean-up, the end-of-apply sweep and `teardownLiveLayers`.
  A `CLEAR` that did not land leaves the producer and its mixer exactly as they were.
- **The harness (`tools/skew-harness/src/wire-tap.ts` `switchWindow`)**: a run's `PLAY` test reads the window
  from the page's `CG … UPDATE` on, so a pre-seat `PLAY` (before the tell) no longer excludes the run from `k`;
  a `PLAY` after the tell still does (`B-155`).
- **The mock (`tools/amcp-mock`)** models `MIXER … OPACITY` (default 1, staged by `DEFER`, reset by
  `MIXER CLEAR`), so a missing reveal is visible offline.

### Choices made (v3), each the smaller and safer option

1. **A layer a producer of ours is on is NEVER hidden before its `PLAY`.** The prompt asks for the hide "on every
   plate seating", and its own hard stop says a refused `PLAY` never clears a layer that held a working
   producer. A `PLAY` onto such a layer is a REPLACE in place (`R-048`'s swap and restore, `B-126`; a switch's
   replace after an on-air catalog re-point, `B-155`'s lurk): the layer's transform is already that plate's box,
   so the new producer inherits the right geometry, while hiding it first would take the working picture off
   air before the replace is known to land — and a refused `PLAY` would leave it off air. So the hide is on
   every seat onto a layer nothing of ours is on (take, switch, a swap or restore onto a fresh layer), and an
   in-place replace keeps today's un-hidden `PLAY`; for the same reason the switch's pre-seat does not take an
   in-place replace (it keeps today's in-switch path, reachable only after a catalog re-point). Pinned:
   `look-switch-all-or-nothing.integration.test.ts` ("never hidden").
2. **The backup's own reconnect re-send is FILED, not built.** The re-send reaches the backup through the one
   seam (`#send` → the adapter), so in `mirror-sync` the backup receives it whenever the PRIMARY reconnects; a
   reconnect of the BACKUP alone would need a send to one session, which the runtime does not have. The prompt:
   "if that needs more than using the same seam, stop this item and report". The backup's ORDER needed no
   change — the adapter journals each line at send time and replays the journal sequentially, so hide, commit,
   `PLAY`, reveal reach the backup in the primary's order (pinned: the journal-replay test).
3. **The re-send covers the PLATE ledger's layers, not template rows' volume.** Template rows only ever get an
   un-deferred `VOLUME` (on take, rehearse and the per-process blanket); the `DEFER` hygiene concerns the plates.
4. **The harness keeps its old layer map** (page on row 9, plates 30–39, rows 70–79). It is the product's
   composition ORDER (bed < plates < templates), and CasparCG draws every layer on every tick whatever its
   number, so the measurement is unchanged by it; the prompt says to update it only if it changes the
   measurement.
5. **This machine has no DeckLink** — see §3 (v3 results): the §0.2 check's "the channel has its DeckLink
   consumer" is a premise the repo already records as false, and every `B-174` number was measured without one.

Already true and pinned by v2: no channel-wide `MIXER <ch> CLEAR`; no `BEGIN…COMMIT`.
