# Tasks

- [x] Store and play a per-layer normalisation gain while keeping the original asset and manual volume.
- [x] Keep the applied gain, estimated levels and Remove normalisation visible in the Sound section.
- [x] Gate exports that use the gain on runtime 1.2.1. Preserve existing export minimums.
- [x] Verify one placement changes, asset count stays at one, and Remove and Undo restore the prior gain.
- [x] Verify playback above +6 dB normalisation gain and the exported package on Windows. The runtime lifecycle suite checked +12 dB before the manual fader. Chromium `audio-element.spec.ts` exported two placements with one WAV and verified the 1.2.1 and 1.1.0 compatibility floors.
- [x] The carrying [Linux Playwright E2E](https://github.com/yasermostafaee/cg/actions/runs/43012308177/job/130494823472) passed on `349544ee`.
