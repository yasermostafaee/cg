# Multi-box audio: the operator can hear, control and — eventually — SEE every input

## Why

A multi-box graphic puts four guests on air at once. Today the console can put all four
**pictures** there and can raise or mute each one's sound **only through a modal dialog opened
from one row**, one plate at a time, with a slider and a MUTE button and nothing else. Three
things follow from that, and they are the whole of this change:

1. **Audio is the one property of a graphic an operator cannot see.** A row whose plate is
   live-and-audible looks identical to one whose plate is silent. `StackItemState.plateVolumes`
   exists and is published precisely so a console CAN show it — and no surface outside the dialog
   reads it. The fact is on the wire and unreachable.
2. **The urgent gestures do not exist.** "Silence everything" and "just this one" are the two
   things a director asks for by name under pressure, and both are currently a sequence of
   individual slider drags inside a dialog that has to be opened first.
3. **There is no way to hear an input before it is on air, and no way to see that it has sound
   at all.** A browser cannot open an SDI feed, and CasparCG's programme channel reports ONE
   peak pair for the whole channel — so both PFL and per-input metering need a plant topology
   this installation has never been measured for.

Points 1 and 2 are answerable **today**, on a verb this plant has already proven
(`MIXER … VOLUME`). Point 3 is not answerable from this repo at all: it rests on facts about
CasparCG 2.5.0 on the owner's hardware that nobody here has measured. So this change ships the
first two and **specifies** the third against a measurement runbook, rather than guessing.

## What Changes

### SHIPPED — the visible PGM audio surface

- **ONE new bridge verb**, applying a **MAP** of plate volumes for one item in a single call
  (`stack.set-plate-volumes`), reporting **per-plate outcome** so a partial failure is visible
  rather than averaged into one boolean. It routes through the EXISTING `setLivePlateVolume`
  writer internally: there is no second spelling of "what volume should this layer have".
- **Four operator verbs, all of them writes to that one map** — FADER, ON/OFF, SOLO, PANIC. No
  new state anywhere, no new resolution level, no new AMCP verb.
- 🔴 **Golden rule 10 first.** Setting a volume is a **configuration** verb. On a row that does
  not own live seats it records intent and **sends nothing** — no `PLAY`, no un-mute, no fill,
  no un-hold — and that is tested for each of the four verbs rather than inherited by assumption
  from `setLivePlateVolume`'s current shape.
- **Audio becomes visible without opening anything**: a per-plate strip in LIVE SOURCES (state
  pill, fader, ON/OFF, SOLO, % readout) with PANIC at the panel head, an audio glyph per box on
  the PVW overlay, and a compact read-only summary on the layer row — **outside** the row's
  six-column verb grid, which nothing here is allowed to touch.
- 🔴 **Every indicator is a PILL, never a bar or a needle.** There is no measurement behind any
  of it until the runbook answers W7/W8, and a pill drawn as a meter is a confidently-wrong
  surface — the worst class of defect this product has.

### SPEC ONLY — gated on `docs/recon/2026-08-23-audio-paths-walk.md`

Nothing below is built. Each is specified so the measurement has something to confirm or refute.

- **A MONITOR / PFL channel** — a second CasparCG channel consuming `<system-audio/>`, fed per
  box by `route://<pgm>-<layer>`, so an operator can hear any input before and while it is on
  air without touching the programme mix.
- **Template-internal box audio** — for a box that is a `<video>` inside the HTML template,
  CasparCG sees ONE audio stream and `MIXER` cannot reach inside it. A per-box gain rides the
  existing look payload and is applied by the `LookMediaPark` seam.
- **Master volume / panic** via `MIXER <ch> MASTERVOLUME`. The PANIC that ships is built from
  per-plate volume and does **not** use it.
- **VU metering for every input**, and the ceiling is MEASURED rather than assumed:
  `audio_mixer.cpp` publishes `state_["volume"]` as a vector of peaks **per AUDIO channel**
  (L/R), maximum across ALL mixed layers — so a per-input meter cannot come from PGM's OSC at
  all. Two paths are specified, and **the MON channel array IS the metering array** — one
  feature, not two, or the install pays for the same channels twice.

## Impact

- `packages/shared-ipc` — one new channel beside `stack.set-plate-volume`. No schema change:
  `LivePlateVolumesSchema` and `StackItemState.plateVolumes` already carry everything.
- `tools/caspar-bridge` — one new runtime method; the golden-rule-10 gate lands **inside**
  `setLivePlateVolume`, the one writer both channels share.
- `apps/runtime` — the strip, the pills, the overlay glyph, the row summary, and ON/OFF + SOLO
  in the existing dialog. `MockRuntime` gains the same verb for offline parity.
- **No new AMCP verb, no new CasparCG channel, no new resolution level, no meter.**
- `docs/recon/2026-08-23-audio-paths-walk.md` — the nine-step plant walk everything spec-only
  is gated on.
