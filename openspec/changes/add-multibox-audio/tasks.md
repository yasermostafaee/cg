# Tasks — multi-box audio: the visible PGM surface now, the plant measurement first for everything else

🔴 **THE SPLIT IS THE POINT.** Section 1 is a runbook nobody in this repo can run. Section 2
ships on a verb this plant has already proven. Sections 3–6 are **specified and NOT built** —
each one names the runbook step that would unblock it, and none of them may be started from the
spec alone.

## 1. The plant measurement — `docs/recon/2026-08-23-audio-paths-walk.md`

- [x] 1.1 Write the walk in the shape of `docs/recon/2026-08-22-b155-switch-flash-walk.md`:
      PowerShell-safe lines, EYE vs INSTRUMENT marked per step, channel EMPTY before and after,
      every step reproducible verbatim.
- [x] 1.2 W1 — does `route://1-<layer>` carry that SOURCE LAYER's audio on 2.5.0?
- [x] 1.3 W2 — does `route://1` (whole channel) carry the channel's SUMMED audio?
- [x] 1.4 W3 — does an `html` producer's internal `<video>` audio reach the channel mix at all,
      and does `MIXER <ch>-<cglayer> VOLUME` scale it?
- [x] 1.5 W4 — does `MIXER <ch> MASTERVOLUME <v>` exist and take on 2.5.0?
- [x] 1.6 W5 — PGM on a real output + channel 2 on `<system-audio/>`: does channel 2's audio come
      out independently, and is channel 1 unaffected? Includes the copy-pasteable
      `casparcg.config` with BOTH channels at the same `video-mode`.
- [x] 1.7 W6 — lip-sync / latency of the routed monitor path vs the programme path.
- [x] 1.8 W7 — does 2.5.0 emit `/channel/N/mixer/audio/volume`, and what EXACTLY is the payload?
      Raw dump captured, not paraphrased.
- [x] 1.9 W8 — with ONE routed input alone on a MON channel, does that channel's peak track that
      input and nothing else? **The step the whole per-input VU design rests on.**
- [x] 1.10 W9 — does this plant need an explicit `<osc>` block? Both forms tested, and which one
      the bridge actually receives on is recorded.
- [ ] 1.11 ⏳ **OWNER-RUN. The walk is written; the numbers are not in it.** Nothing in sections
      3–6 may begin until this is filled in on the production plant (2.5.0, `69e8ad5`).

## 2. SHIPPED — the visible PGM audio surface

### 2a. The one new bridge verb

- [x] 2.1 `StackSetPlateVolumesChannel` (`stack.set-plate-volumes`) in
      `packages/shared-ipc/src/channels/stack.ts`, beside `stack.set-plate-volume`. Request is
      `{ itemId, volumes: Record<plateId, 0..1> }`; response carries `ok` plus a `results` array
      of `{ plateId, ok, reason? }` — **per-plate outcome, never one averaged boolean**.
      ⚠ An inline code span may not WRAP across a line inside a list item: prettier reflows it,
      then rejects its own output, and `format:check` fails forever with no diff to read.
- [x] 2.2 `CasparRuntime.setLivePlateVolumes` composing the EXISTING `setLivePlateVolume` writer
      per entry. No second spelling of "what volume should this layer have".
- [x] 2.3 The verb holds `#withLiveSeatLock` for the item, ONCE, around the whole map — so SOLO's
      cross-plate statement cannot be interleaved by a look switch, and so a reconcile cannot
      seat from an intent map it read before our write. Rationale in `design.md` §3.
- [x] 2.4 Routed in `tools/caspar-bridge/src/bridge.ts`; bridge contract method in
      `apps/runtime/src/shared/runtime-bridge.ts`; `WebSocketRuntime` + `createRuntimeBridge`
      wiring; `MockRuntime.setPlateVolumes` for offline parity.

### 2b. Golden rule 10 — ONE gate, on the path all four verbs share

- [x] 2.5 `setLivePlateVolume` gates its WIRE half on `#ownsLiveSeats(itemId)`. On a row that
      owns no live seats: no `MIXER … VOLUME`, no ledger `intendedVolume` write, no un-hold —
      and the intent is still recorded.
- [x] 2.6 The gate is at the ONE shared writer, not per verb, so the single-plate channel and the
      map channel are gated by the same code and a fifth verb inherits it by construction.

### 2c. The four operator verbs — all writes to that one map

- [x] 2.7 FADER — 0..1, commits on RELEASE.
- [x] 2.8 ON / OFF — OFF writes `0`, ON writes `1`. **OFF-then-ON returns to 100 %, NOT to the
      previous fader value**, and the UI says so. The second store of intent that would restore
      it is the `B-100` / `P-012` class and is rejected deliberately (`design.md` §4).
- [x] 2.9 SOLO — `1` to this plate and `0` to every sibling plate seated for the same item, in ONE
      call. No restore, and the UI does not imply one.
- [x] 2.10 PANIC — `0` to every plate of every ON-AIR item, from `isOnAir` (the console's one
      predicate, imported). Built from per-plate volume, **NOT** from `MASTERVOLUME`. The
      `B-122` tension and its containment are recorded in `design.md` §5.

### 2d. Make audio VISIBLE without opening anything

- [x] 2.11 `LiveSourcesPanel` — a per-plate audio strip: state pill, fader, ON/OFF, SOLO, %
      readout. PANIC at the panel head.
- [x] 2.12 `LivePlateOverlay` — a small per-box audio glyph: audible / silent / held.
- [x] 2.13 The layer row — a compact READ-ONLY summary (`audio 2/4`), in the alias cell, **outside**
      the six-column verb grid. `VERB_COUNT` stays 6 and no header word moves.
- [x] 2.14 `LivePlateAudioDialog` stays and gains ON/OFF and SOLO.
- [x] 2.15 A HELD plate reads **"armed, not audible — hidden by this look"**, never
      silent-and-fine, and is **never greyed** — grey reads as disabled, and the control stays
      live because arming a held plate before switching to its look is the affordance the mute
      rule exists to preserve.
- [x] 2.16 🔴 Every state indicator is a **PILL**. No bar, no needle, no meter shape anywhere.

### 2e. Tests — RED first, chain rebuilt before EACH reading

- [x] 2.17 SOLO emits exactly one `MIXER … VOLUME 1` and N−1 `MIXER … VOLUME 0`, and writes the
      same into `plateVolumes`.
- [x] 2.18 PANIC touches ON-AIR items only.
- [x] 2.19 A HELD plate receives NO wire command from any of the four verbs, and its intent is
      still recorded.
- [x] 2.20 Golden rule 10 — on a row where `#ownsLiveSeats` is false, each of the four sends zero
      commands and still records intent.
- [x] 2.21 `plateVolumes` survives a simulated bridge blip through retention, for all four verbs.
- [x] 2.22 `0` is never confused with absent, in every new read.
- [x] 2.23 The new tests COMPILE — typechecking tests is policy for `apps/runtime` and
      `caspar-bridge`.

## 3. SPEC ONLY — the MONITOR / PFL channel ⏳ gated on 1.11 (W1, W2, W5, W6)

- [ ] 3.1 A second CasparCG channel declared as MONITOR, consuming `<system-audio/>` (+ `<screen/>`
      for a multiview), fed per box by `route://<pgm>-<layer>`.
- [ ] 3.2 Selecting an input for monitoring sends NOTHING to the programme channel.
- [ ] 3.3 The two known constraints enforced at the config boundary: same `video-mode`/framerate
      on both channels, and `<system-audio/>` downmixes to stereo.

## 4. SPEC ONLY — template-internal box audio ⏳ gated on 1.11 (W3)

- [ ] 4.1 A per-box gain on the existing look payload to `@cg/template-runtime`.
- [ ] 4.2 Applied by the `LookMediaPark` seam to that box's media element; the park's silence half
      still wins for a box the active look does not show.

## 5. SPEC ONLY — master volume ⏳ gated on 1.11 (W4)

- [ ] 5.1 `MIXER <ch> MASTERVOLUME` as the channel master, independent of per-plate volume.

## 6. SPEC ONLY — VU metering for every input ⏳ gated on 1.11 (W7, W8)

- [ ] 6.1 `osc.channel.audio.peak` on `OscEventSchema`; a channel-only case in
      `OscInterestFilter.shouldEmit` beside `osc.framerate`.
- [ ] 6.2 Path (a): ONE CasparCG channel per metered Live Source input — **the same array as §3**,
      specified and costed once.
- [ ] 6.3 Path (b): a Web Audio `AnalyserNode` inside `@cg/template-runtime` for a
      template-internal `<video>`, pushed up the existing `__cg` seam. Works with no MON channel.
- [ ] 6.4 ~25 Hz with peak-hold and decay, on its OWN budget — never through the `OscRateLimiter`
      allowance that protects state events.
- [ ] 6.5 An intent pill and a level meter stay visually distinct. Merging them is forbidden.

## 7. Gate

- [x] 7.1 `pnpm gate` green (uncached).
- [ ] 7.2 ⏳ **Linux `gate:e2e` OWED** — this change alters UI and rendering (`LiveSourcesPanel`,
      `LayerRow`, `LivePlateOverlay`, `LivePlateAudioDialog`). Discharged ONLY by a COMPLETED,
      GREEN `e2e` job on GitHub Actions for the commit that carries the change, cited by run URL
      **written here beside this item**. A Windows pass does not discharge it; neither does a
      cancelled or skipped run.

      Run URL: _(not yet — pushed, awaiting CI)_
