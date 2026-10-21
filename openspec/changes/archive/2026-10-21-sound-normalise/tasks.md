# Tasks — sound-normalise (RUN-NEXT-VERSION-02 Q10)

Lane: **FULL** — a persisted key (`AudioInfo.loudnessLufs` / `truePeakDbtp`) and what a template plays on air.

- [x] 1.1 `@cg/shared-schema`: `AudioInfoSchema.loudnessLufs` / `truePeakDbtp` (optional, additive);
      `AUDIO_LOUDNESS_TARGET_LUFS` (−23) and `AUDIO_TRUE_PEAK_CEILING_DBTP` (−1).
- [x] 1.2 Designer `loudness.ts` (pure): BS.1770-4 K-weighting for any rate, 400 ms / 100 ms gated blocks, a short
      sound as one block; 4× true peak; the gain (`min(−23 − L, −1 − TP)`), the 0.5 dB offer threshold; `withGain`.
- [x] 1.3 The import records both facts.
- [x] 1.4 The Sound section: `loudness`, `true peak` (an older sound measured from its bytes), and the offer;
      `normaliseSound` stores the new asset and `replaceAudioAsset` re-points every use in one undo step.
- [x] 1.5 Tests: `loudness.test.ts` (the K-weighting table at 48 kHz; Tech 3341-style sines and gating; short sound;
      silence; an inter-sample peak; the gain, the ceiling, the threshold; `withGain` lands on −23),
      `sound-normalise.dom.test.ts` (readouts, offer, re-point + one undo, nothing offered, an older sound),
      `audio-import.dom.test.ts` (unchanged, green); e2e `audio-element.spec.ts` Q10 — Windows, non-authoritative.
- [x] 1.6 Linux `e2e` discharged on the pushed commit
      — run [39588699000](https://github.com/yasermostafaee/cg/actions/runs/39588699000) on `c23b1cea` (which carries `a5ebc4d2`): success, read from the log: `ci` and the `E2E` step RAN — Designer 340 passed / 13 skipped; CG Control 353 passed / 2 skipped / 2 flaky (`pvw-live-plate-placeholder.spec.ts:381`, `rehearse-layout.spec.ts:81`: layout timing, passed on retry, not touched by this change); `audio-element.spec.ts` Q10 among them.
