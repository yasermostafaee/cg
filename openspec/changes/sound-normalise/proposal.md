# A sound's loudness, measured at import, and normalisation offered per sound (RUN-NEXT-VERSION-02 Q10)

## Why

`D-165` imported sounds measured by their PEAK only, and normalised nothing: "normalising is the owner's question".
`REPORT-RUN-NEXT-VERSION-01` asked it (Q10); the owner accepted: normalise by LOUDNESS (−23 LUFS, −1 dBTP), offered per
sound. A peak says nothing about how loud a sound is heard — a short click and a long swell can share one — so effects
imported from different sources arrive at different levels, and the author had only the volume field and their ears.

## What Changes

- **Measured at import.** Each imported sound records its integrated LOUDNESS (ITU-R BS.1770-4, gated, LUFS) and its
  TRUE PEAK (4× oversampled, dBTP), measured from the stored WAV like its length and peak. A sound shorter than one
  400 ms block is measured over its own length. Silence is "too quiet to measure". A sound stored before this is
  measured from its bytes when its Sound section opens.
- **Offered per sound, never applied silently.** The Sound section shows `loudness` and `true peak`, and — when the gain
  that takes the sound to −23 LUFS without crossing −1 dBTP is 0.5 dB or more — a button `Normalise to −23.0 LUFS`
  naming where the sound will land (short of −23 when its peaks stop it), its gain in the title.
- **What Normalise does.** It stores the normalised sound as a NEW asset, `<name> (-23.0 LUFS).wav`, measured like any
  import, and points every `audio` element that played the original at it, in one undo step. The original stays in
  Project Assets untouched.

## Why not at import, for every sound

A sound meant to sit under a voice is quiet on purpose; normalising every import would undo that without asking. The
import measures; the author decides per sound.

## Impact

- **Specs:** `designer-audio-element` (MODIFIED × 1: the import requirement — still nothing normalised AT IMPORT, and
  loudness and true peak recorded; ADDED × 1: the offer).
- **Code:** `@cg/shared-schema` (`AudioInfoSchema.loudnessLufs` / `truePeakDbtp`, optional + additive; the target and
  ceiling constants), the Designer (`loudness.ts` — the meter and the gain, pure; `normaliseSound.ts`; the import; the
  Sound section; `replaceAudioAsset`). No `.vcg` format change: the normalised sound is an ordinary audio asset.
