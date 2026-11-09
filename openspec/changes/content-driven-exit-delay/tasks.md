# Tasks

- [x] 1.1 Register D-205 and distinguish the exit delay from Timed hold and inter-pass gap.
- [x] 2.1 Persist the duration, author it in Playback and include it in export metadata.
- [x] 2.2 Start the delay after content completes. Verified exact 60000 ms timing, pause,
      Stop, replay and repeated passes in controller tests.
- [x] 3.1 Chromium authored the delay on the Azan starter, enabled its nested hold driver, watched
      the zero announcement remain visible and observed automatic Outro completion.
- [x] 3.2 The full pre-push gate and strict OpenSpec validation passed on `d6383de0`.
- [ ] 3.3 Verify the configured post-zero hold and Outro on the target plant.
