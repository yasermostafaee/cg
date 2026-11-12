# Live frame placement

- [x] Trace authored frame and Look geometry through the page, Preview and Bridge.
- [x] Export the author opt-in and proportional/free resize policy by frame instance.
- [x] Draft placement and resize in PVW, then support Discard and off-air Update.
- [x] Apply the same geometry to the on-air page and the seated producer on a verified primary.
      Bridge tests covered simultaneous edits on two rows and separate frames on one row, paired
      foreground pages, and restoring the prior placement after a refused CLIP or COMMIT.
- [x] Verify the frame and title in fresh Windows Chromium, including Discard, the next Take and
      Update on air. Verify nested Look identity and both authoring policies in the carrier and
      Designer suites.
- [x] Verify the separate **Edit frames** icon and label, mutual exclusion with Move template, and the monitor header at a narrow width.
- [ ] Verify title, fallback, mask and picture alignment on the target engine.
- [ ] Record the carrying Linux Playwright result.
