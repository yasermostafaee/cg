# media-plates — a media clip in a plate: when hidden, loop, freeze at end, and transport on air

Prompt: `MEDIA-PLATES-01` (v2), run inside `DAY-RUN-02` (v2). PRD: `R-071` (`docs/prd/runtime.md`). It builds on
`LOOK-SWITCH-01` (the one seat step), `PLAYOUT-SOURCES-01` (the store of bound media) and `ROUTE-PLATES-01` (a
held route hidden with `OPACITY 0`; the send-seam guard).

## Why

A clip playing in box 2 of a two-box look was torn down whenever the operator switched to a one-box look, and
started again from the beginning when a look showed it — on the premise, written into the code, that a held clip
"runs to its end and comes back black". On 2.5.0 that is false: a clip that is not looping freezes on its last
frame (`av_producer.cpp`, and measured on the owner's core). The market's common shape is a per-clip setting plus
manual transport on air: vMix's Auto Play / Auto Restart / Auto Pause, TriCaster's AutoPlay, Cinegy Title's Free
Run and Freeze on end, Viz's Autorun / Loop / hold last frame.

## What Changes

- **Two settings per bound clip, station-wide, on its bound-media reference:** `loop` (default off) and
  `whenHidden` — `pause` (default), `restart` or `continue`. One operator route sets them,
  `sources.set-media-playback`, audited with the clip's name; the catalogue carries them to every console.
- **The look switch honours `whenHidden`.** Hiding a clip is always `OPACITY 0` and the mute, staged in the
  switch's one commit (with the park); `pause` also sends `PAUSE` right after that commit; `continue` sends
  nothing more; `restart` is torn down as before. Showing it again is the reveal (`OPACITY 1`) with its declared
  volume in the switch's one commit, after a `RESUME` for a clip the hide paused. The reconnect re-send keeps a held
  clip hidden.
- **Loop and the freeze.** A clip with Loop on is played with `LOOP`; a Loop change reaches a playing clip at once
  (`CALL <ch>-<L> LOOP 1|0`). A clip that is not looping freezes on its last frame — nothing is sent for it.
- **Transport on an on-air row:** `stack.media-plate-transport` — `pause` (`PAUSE`), `play` (`RESUME`) and
  `restart` (`CALL … SEEK 0`, then `RESUME`). Operator-class, the row's channel, behind the lock, audited; refused
  with nothing sent for a live input, a plate not seated, or a row not on air.
- **The send seam** refuses a `PAUSE`, `RESUME` or `CALL` to anything but a seated clip of ours: on the Playout's
  core a `CALL` to a live producer gets no reply and holds every channel's AMCP for 5 s.
- **The remaining time, from OSC only:** `liveLayers.media-state` publishes each seated clip's remaining time
  (absent when the server reports none), paused, ended and loop.
- **Console:** where a clip is bound (Look inputs, Source defaults) a `Playback` button opens a panel headed by the
  clip's name — `Loop`, and `When hidden`: `Pause` · `Restart` · `Keep playing`. On an on-air row a clip plate
  shows Play/Pause and Restart, `−0:12` when known, and `Paused` / `Ended`.
- **The fakes:** the AMCP mock accepts `PAUSE`, `RESUME`, `CALL … SEEK`/`LOOP` and `PLAY … LOOP`, runs each clip's
  clock (advancing, paused, ended at its length) and reports it over OSC; the fake station tells it each library
  clip's length.

Unchanged, and pinned: a live-input plate's hold, release and wire (byte-identical, measured against the tree
before this change); the take's order and `B-174`'s; `FIELD-FIXES-01-A`; the take-out, which clears every clip.

## Capabilities

### Modified Capabilities

- `runtime-caspar-bridge`: a clip follows its `whenHidden`; `LOOP` and the freeze; the transport verb; the clips'
  clock from OSC; the reconnect re-send keeps a held clip hidden.
- `runtime-playout-sources`: a bound clip carries its two settings; one route sets them.
- `runtime-ui`: `Playback` where a clip is bound; the transport on an on-air row.
