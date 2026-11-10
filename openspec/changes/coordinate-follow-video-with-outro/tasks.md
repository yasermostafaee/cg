# Tasks

- [x] Inspect the supplied project archive without executing it and identify the serial Outro gate.
- [x] Reproduce the owner's 50 fps timeline. At 300 ms after Stop, text opacity was still 1;
      the authored frame 525 calls for 14/29.
- [x] Verify Follow video and plain text keyframes share the Outro, with and without a 30-frame
      delay. The 94 focused runtime tests passed, including pause/resume, authoring scrub, the
      nested exit and existing Sequence-item transitions.
- [x] Windows Chromium verified the authored delay in Designer Rehearse with real video playback.
      The text faded while the video was held, reached zero, and then the video advanced.
- [ ] Record carrying Linux E2E.
