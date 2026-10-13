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

      🔴 **STILL UNRUN AS OF 2026-08-25, and this is recorded so the date is not mistaken for
      progress.** The owner DID visit the plant that day and ran a different sheet end to end —
      `docs/recon/2026-08-25-decklink-model-walk.md`, all four DeckLink questions answered. **The
      audio walk was NOT run. W1–W9 are all still empty**, and every gate in sections 3–6 holds.

      🔴 **AND W5 CANNOT BE RUN ON THE CURRENT CONFIGURATION AT ALL — it needs a config edit and a
      restart before it is even attemptable.** `INFO CONFIG`, read on the plant the same day,
      shows a **SINGLE `<channel>`**:

      - one channel, `1080p5000`;
      - consumers `<decklink>` (device `23487013`, with `embedded-audio`), `<screen/>`,
        `<system-audio/>`;
      - **no `<osc>` block** — which is the state W9 was written to confirm, and it is now
        confirmed from the config side (the walk still owes the wire-side half).

      W5 is _"PGM on a real output + channel 2 on `<system-audio/>`"_. **There is no channel 2.**
      Creating one is an edit to `casparcg.config` plus a server restart — not a console command —
      so W5 cannot be slipped in opportunistically at the end of an unrelated visit. ⚠ **W2
      depends on W5's two-channel config** (it says so itself: `route://1` on a single-channel
      install is a feedback loop), so a visit that skips the config edit loses W2 as well.
      **Plan the config block deliberately, or the next visit ends the same way.**

      ⚠ **This does NOT change any gate and ticks nothing.** It records what a plant visit
      produced and what it did not, because "the owner went to the plant on 2026-08-25" will
      otherwise read as progress against this item. It is not.

      **Also unmeasured after the same visit** (recorded here only so one list holds the plant
      backlog): `B-155`'s frame count — `multibox-layout-switch` `tasks.md` **7.15** still owes
      it — and [[B-174]]'s page/mixer skew `k`.

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
- [x] 2.10 PANIC — `0` to every plate. Built from per-plate volume, **NOT** from `MASTERVOLUME`.
      ⚠ **SUPERSEDED IN SCOPE by `PATCH-BX-01` B (task 8), and the first version is recorded
      rather than overwritten**: it addressed every ON-AIR item, resolved in the BROWSER from
      `isOnAir`. That was `B-122`'s shape — an emergency control gated on believed status — and
      it is now a bridge verb scoped from the LEDGER. See `design.md` §5.

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
- [x] 2.18 ⚠ **REPLACED by 8.5 — "PANIC touches ON-AIR items only" was the DEFECT, not the
      property.** It is left here rather than deleted because it is what the change originally
      asserted, and the reversal is the useful record.
- [x] 2.19 A HELD plate receives NO wire command from any of the four verbs, and its intent is
      still recorded.
- [x] 2.20 Golden rule 10 — on a row where `#ownsLiveSeats` is false, each of the four sends zero
      commands and still records intent.
- [x] 2.21 `plateVolumes` survives a simulated bridge blip through retention, for all four verbs.
- [x] 2.22 `0` is never confused with absent, in every new read.
- [x] 2.23 The new tests COMPILE — typechecking tests is policy for `apps/runtime` and
      `caspar-bridge`.

## 8. `PATCH-BX-01` B — PANIC's scope moves from the STACK to the LEDGER

🔴 **The residual `design.md` §5 recorded became the behaviour.** The first cut gated an
emergency control on the console's believed status; a row holding seats while not reading on
air was never reached, and a browser whose ledger snapshot had not arrived would have silenced
nothing and reported success.

- [x] 8.1 `stack.silence-all-live-plates` — a bridge verb taking **NO arguments**, so no caller
      can narrow an emergency control's reach. `clearAll` is the precedent.
- [x] 8.2 `CasparRuntime.silenceAllLivePlates()` iterates the LEDGER and composes the ONE
      writer per plate. Report: `silenced` (reached the wire) and `recorded` (intent written,
      including held) as distinct numbers, plus the rows it addressed and the plates that
      failed. `ok` only when something was owed AND all of it landed.
- [x] 8.3 🔴 The gate in `setLivePlateVolume` becomes **DIRECTIONAL** — a RAISE needs
      `#ownsLiveSeats`, a SILENCE never does — rather than PANIC carrying an exemption. Rule 10
      forbids _"no `PLAY`, no un-mute and no fill"_; a mute is none of the three. This also fixes
      OFF and a fader dragged to zero, which were refused the wire on exactly the rows where a
      guest could be audible.
- [x] 8.4 A plate the LEDGER seats is addressable even when the item has left the stack — a
      stranded live layer is the one thing nothing else in the product can reach, and it was
      being refused `unknown-plate`.
- [x] 8.5 Tests, RED-first and **proven red by reverting each change in turn**: a seated
      off-air row IS silenced (3 tests red without the directional gate); PANIC still silences
      on-air rows; the wire carries ONLY `MIXER … VOLUME 0`; held plates record intent and send
      nothing; a stranded seat is reachable (red without 8.4).
- [x] 8.6 `design.md` §5 rewritten — and it corrects its own earlier claim that `exitRehearse`
      CAUSES the seated-off-air window. Measured: a rehearsing row's plates are never seated.
      **Boot adoption (`B-145`) is the origin**; rehearse only passes through it.
      ⚠ **Half wrong when written — corrected 2026-09-04 by 8.8:** the `update` verb DID seat a
      rehearsing row's plates from `B-161` until `B-216`, because `#ownsLiveSeats` carried the
      rehearse flag. The swap half of the probe was right for the wrong reason (its own gate).
- [x] 8.8 🔴 **`B-216` (`UPDATE-INFORCE-02`, 2026-09-04) — OWNERSHIP IS THE LEDGER, at the audio
      door too.** `#ownsLiveSeats` = `on air OR the ledger holds seats`; the rehearse flag is out
      of it. Consequences here: a RAISE on a row whose seats survived a restart (adopted, status
      not on air) now REACHES the wire — the producer is genuinely on the channel and the
      operator pressing ON for a guest they can see is the case; a raise on a row with NO seats
      (loaded, or rehearsing and never taken) reaches nothing and records the intent, as before;
      rehearsal changes nothing about ownership. 8.3's directional rule is untouched.
      **Tests:** the GOLDEN RULE 10 block of `live-plate-audio-verbs.integration.test.ts` was
      rewritten to the ledger axis (`loadedWithSeats` now sends a raise; `loadedWithoutSeats` is
      the row that owns nothing) — six of its tests go RED with the old predicate restored. The
      requirement and scenarios in `specs/runtime-caspar-bridge/spec.md` were replaced. Full
      item: `docs/prd/bugs-runtime.md` **`B-216`**.
- [x] 8.7 **Linux `gate:e2e` DISCHARGED** — a COMPLETED, GREEN `e2e` job on `ubuntu-latest` for
      commit `104a5cd4`, which is `dev`'s tip and carries this patch:
      <https://github.com/yasermostafaee/cg/actions/runs/32649701579> — run `conclusion: success`,
      `E2E (Playwright)` job conclusion `success`, and the job really RAN Playwright rather than
      being killed early (9m45s; runtime **92 passed**, designer **269 passed / 12 skipped**).

      ⚠ **The FIRST attempt at this run was RED, and by this patch's own doing.**
      `8b4c852c`'s run (<https://github.com/yasermostafaee/cg/actions/runs/32647108544>) failed on
      `live-source-layers.spec.ts` — it pressed PANIC on a seeded `loaded` row and expected the
      refusal _"no row is on air"_, which is precisely the rule 8.x DELETED. The unit tests that
      encoded the old rule were corrected in `09eb9760`; this Playwright spec was missed, and
      `pnpm gate` does not run Playwright (`P-028`), so no local signal existed. Fixed forward in
      `104a5cd4` — the spec now asserts that the seated-off-air row IS reached, which is the
      regression guard this change actually wanted, and it was proven RED by reinstating the old
      `items.filter(isOnAir)`-joined-to-`liveRows` scope.

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
- [x] 7.2 **Linux `gate:e2e` DISCHARGED.** This change alters UI and rendering
      (`LiveSourcesPanel`, `LayerRow`, `LivePlateOverlay`, `LivePlateAudioDialog`), so a Linux
      E2E was owed.

      **Run URL: https://github.com/yasermostafaee/cg/actions/runs/32639516624** — commit
      `6f720776`, `conclusion: success`, and the **`E2E (Playwright)` job actually RAN** (it was
      not skipped) alongside `Lint • Typecheck • Test • Build`. 92 runtime specs + 269 designer
      specs green.

      ⚠ The FIRST push of this change (`7bdb085a`) went red on that job and does **not**
      discharge anything — its `ci` was green and its `e2e` failed on one assertion in the new
      spec, which searched for a button named `/restore/i` to prove no un-solo is offered and
      matched the SOLO buttons themselves ("…with no restore"). Fixed in `6f720776`. Recorded
      here rather than quietly replaced: a red run is evidence about a commit, and the next
      reader should be able to see which commit the green one is for.
