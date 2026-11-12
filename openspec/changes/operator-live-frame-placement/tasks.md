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
- [x] Stage **Reset frames** from Inspector → Position and apply it through Update or Update on air.
- [x] Windows Chromium verified immediate PVW reset, Discard, Update on air and unchanged
      whole-template Position. The served frame returned to its authored width.
- [x] Carry independent frame movement and resize policies through Designer and the export.
      The focused 18 Inspector DOM and 35 carrier tests passed. Windows Chromium verified
      authoring and export for move-only and resize-only frames.
- [x] Windows Chromium verified move-only and resize-only affordances, the default-on frame
      ratio option, and an unlocked resize changing width independently of height.
- [ ] Record the carrying Linux Playwright result for independent permissions and Reset frames.
- [x] Group Fit, Allow move and Resize under **CG Control** for one or several selected live
      plates. Focused Designer tests cover mixed values, single-step Undo and independent edits.
- [x] Windows Chromium verified the resize-only frame body uses a neutral cursor during hover
      and attempted drag, while its corners retain the resize cursor.
