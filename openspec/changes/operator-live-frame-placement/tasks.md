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
- [x] Expose and export an independent Auto layout permission on the open composition.
      Designer Chromium verified that it is off initially, can be toggled and reaches the VCG.
- [x] Share Designer's layout calculation with CG Control without changing the Designer result.
- [x] Windows Chromium verified Arrange and Swap move both styled titles with their frames,
      Discard restores the authored positions, Take carries the saved layout, and Update on air
      applies a single frame-placement update while retaining the seated inputs.
- [x] Verify a move-only frame moves its linked title without changing its authored frame size.
- [x] Windows Chromium verified one-, two-, three- and four-frame presets, preset-specific
      controls and gaps, round-trip Swap, and saving the separate placements without off-air playout.
- [x] Windows Chromium measured both composition checkboxes at the standard 14 × 14 CSS pixels
      and verified their values in the exported VCG.
- [x] Windows Chromium verified typing and dragging gaps reflows PVW while the active preset's
      applied geometry stays fixed until Update. Partial and out-of-range input preserve the draft.
- [x] Windows Chromium verified replacement import followed by one placement update to the
      held page and the same input seats. Bridge tests also verified a preset rename and refusal
      before commands when the authored frame rectangle or key changes.
- [ ] Record the carrying Linux Playwright result for Auto layout and title movement.

## Designer Auto layout

- [x] Arrange two or more selected visual layers with the existing layout, gap and swap controls.
- [x] Use the live plate bounds of a single-plate composition instance while keeping its artwork attached.
- [x] Windows Chromium verified titled child compositions in a preset, arrangement and Swap,
      preserved title background and padding, independent reuse in another preset, and exported geometry.
- [x] Windows Chromium verified a mixed selection of a plate, composition, rotated shape and
      Repeater, proportional sizing, unchanged layer order and one-step Undo per action.
- [x] Focused geometry tests verified the non-zero composition anchor, auto-sized RTL title
      and exclusion of audio and locked layers.
- [x] Windows Chromium verified proportional Width, Height and Canvas resize for titled frame
      instances, free resize when unlocked, restoration of legacy stretched geometry and Undo.
- [x] The owner's `2ghab-composition.cgproj` opened with its saved transforms. Restoring both
      instances recovered 16:9 and retained the titles. Re-export verified the root permission
      and both 16:9 frames in the second preset.
- [ ] Record the carrying Linux Playwright result for Designer Auto layout.
