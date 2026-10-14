# Design — `add-audio-element` (`D-165`)

## §0 — measured before building (any "no" would have stopped the change)

All on the owner's local **CasparCG 2.5.0 69e8ad5** (`127.0.0.1:5250`, channel 1 = 1080p50; its CEF
reports Chrome 142). Every run removed its layer (`CG STOP`, `CLEAR`) and deleted its template file.

### 0.1 Does CasparCG play a template page's own sound? — YES

- A test page (`<audio>` with a 2 s, 1 kHz, 48 kHz 16-bit stereo WAV as a `data:` URI) calls
  `play()` on load with NO user gesture. `play()` resolved; the page saw `playing` and `ended`.
- Measured from CasparCG ITSELF, not by ear: `INFO 1` → `<mixer><audio><volume>` (16 values, the
  channel's audio channels; 1–2 carry stereo) holds the PEAK sample in 32-bit integer scale.
  - amplitude 0.5 (−6.02 dBFS): 0 before → **1,073,686,656** during (0.49997 × 2³¹ → **−6.02 dBFS**) →
    0 after.
  - amplitude 0.125 (−18.06 dBFS): **268,452,896** (→ **−18.06 dBFS**) — the meter is linear.
- What CasparCG needs: nothing — no CEF flag, no gesture rule, no page trick.

### 0.2 What volume the page layer has on air (`tools/caspar-bridge/src/caspar-runtime.ts`)

- **Muted before every `CG ADD`** (C-015 6.5): `MIXER <slot> VOLUME 0` precedes the ADD at all four
  emit sites (load, pending restore, re-ADD for a position, a take's pre-roll); a failed mute refuses
  the ADD. A sound a page made while CUED is therefore silent — and none is authored to: every start
  is at or after `CG PLAY`.
- **Raised at every take** (R-022): `MIXER <slot> VOLUME 1`, unconditional, after the ADD and BEFORE
  the plates and the `CG PLAY` — so an entrance sound is audible from its first sample.
- **Rehearse (PVW)** on a row whose producer is resident (stopped, not cleared) sends `VOLUME 0`;
  leaving rehearse or the next take restores 1. **Startup** re-asserts 1 on every declared row.
- ⇒ **Audible** from a take through the hold and the exit animation (`CG STOP`). **Silenced** while
  cued, while rehearsing a resident row, and after a hard `CLEAR` (the page is gone).
- The take's `VOLUME 1` is a jump, not a ramp (the Playout's V13 §3.1) — never heard: it lands before
  `CG PLAY`, and the sound starts at or after `CG PLAY`.

### 0.3 The Playout contract

`PLAYOUT-CG-RESPONSE-V13-STATE` §3.1 (C1) and `…-HOLDER` §3.2.2 govern PLATES bound to Playout
inputs: they start at `VOLUME 0`, a take and the bank sweep must not raise them, a deliberate raise is
allowed, and the same input routed by both sides sums before the limiter (~+6 dB). **Nothing in the
written contract forbids or limits a template page's own sound.** It is new programme audio from CG on
the row's page layer — the letter the owner's assistant sends should say so (report §7).

### 0.4 The previews

- The Designer's Preview is a same-origin `srcDoc` frame with no sandbox: after the author's click,
  Chrome plays its sound. **Audible by default, with a Sound switch.** The canvas never runs the
  lifecycle (it is scrubbed by `tick`), so it is silent by construction.
- CG Control's PVW (`RehearsalFrame`) renders the byte-identical page and could play its sound.
  **Silent**, by muting the page through its own runtime on load, before the frame reports ready.

### On air — the built element

A single-file template made by the SHIPPED exporter (`ExporterSingleFile`, the path CG Control serves
CasparCG), one `audio` element over a 2 s 1 kHz tone at −6.02 dBFS, `CG 1-992 ADD … 1`:

| element                        | channel meter                                    |
| ------------------------------ | ------------------------------------------------ |
| entrance, 0 dB                 | **−6.02 dBFS**; silence before and after `CLEAR` |
| entrance, −12 dB               | **−18.02 dBFS**                                  |
| entrance, +6 dB                | **−0.02 dBFS** (no clip)                         |
| exit, 0 dB                     | silence until `CG STOP`, then **−6.02 dBFS**     |
| exit, 0 dB, hard `CLEAR` first | **silence** (control: the `CG STOP` run above)   |

Web Audio (`MediaElementSource` → gain) works in CasparCG 2.5.0's CEF with no gesture.

## Decisions

1. **The page plays the sound; the bridge sends nothing.** §0.1 says it reaches the output, and §0.2
   shows the existing volume rule already makes it audible exactly from the take. No new AMCP command.
2. **One stored form: 16-bit PCM WAV, 48 kHz, stereo.** It is what §0.1 measured; PCM needs no codec
   in CEF. 48 kHz is the channel's rate. Effects are short, so the size (192 kB/s) is acceptable; a
   compressed form is a later choice, not this one.
3. **A mono sound keeps its level.** `-ac 2` would upmix it through the −3 dB pan law (a −6 dBFS mono
   tone read −9.0 dBFS — measured in the shipped core by this change's e2e before the fix). The
   converter probes the source and copies mono into both channels at unity.
4. **WHEN is the driver's, HOW is the graph's.** `AudioDriver` joins the content-driver calls
   (`reset`/`start`/`pause`/`resume`/`stop`/`destroy`/`playOutro`) and never a hold array. A Web Audio
   gain carries the volume — a media element's `volume` stops at 1.0 and the range runs to +6 dB — and
   the fades.
5. **An exit sound is not cut by its own exit.** Element outros are awaited BEFORE the template's
   exit animation, so `playOutro()` starts the sound and resolves at once; the settle that follows
   calls `stop()`, which cuts an entrance or timed sound still playing but lets the exit sound finish.
   A new play, a pause and the page going away (`destroy()`) are what stop it.
6. **A hard Clear plays nothing**: no exit, no exit sound (on air: silence).
7. **A timed sound** starts its ms after the entrance on the injected clock; a pause holds its
   countdown; one whose moment has not come when the exit begins never starts.
8. **Once per occurrence**: a loop cycle is a new occurrence (its entrance sound plays again); a hold
   never repeats a sound.
9. **Nothing is normalised.** The peak is measured and shown; normalising is the owner's question.
10. **`hasSound` rides `TemplateInfo`**, derived once at import by `hasSoundEffects` (golden rule 6),
    for `hasNext`'s reason — every console marks the row alike. The mark is a `Tag`, not a control: a
    per-row mute is the owner's question.
