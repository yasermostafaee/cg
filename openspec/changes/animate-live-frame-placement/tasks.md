# Live frame placement effects

- [x] Specify a bounded phase plan and validate the optional request and runtime payload.
- [x] Add motion, Fade and duration controls to the on-air frame placement workflow.
- [x] Animate the seated picture and the resident artwork pages with matching phase endpoints.
- [x] Cover combined effects, legacy Cut behavior, a refused foreground update, Stop and
      emergency silence in focused tests.
- [x] Windows Chromium verified selecting Ease in/out with Fade, immediate PVW and Update on air
      through the real Bridge with a mock AMCP engine.
- [x] A local reference-engine file capture at 25 fps verified move, resize, fade-out and
      fade-in of the live input and its tied foreground title, with the correct final geometry.
- [x] [Linux Playwright](https://github.com/yasermostafaee/cg/actions/runs/43623019929/job/132532721505)
      completed its E2E step successfully on `e798ca3b`.
- [ ] Verify picture, title, fallback and mask alignment on the target Playout Engine.
- [x] Carry effect selection and authored frame identity into the on-air preset switch.
- [x] Verify both directions between a one-frame and a two-frame preset, with the shared producer
      retained. Windows Chromium and a Bridge smoke test with the owner's `3ghab-composition.vcg`
      passed.
- [x] Verify the owner's masked `3ghab-crop.vcg` from preset 2 to 1 with the real Bridge and
      mock AMCP. In the Windows Chromium regression, both pages hide the departing group before
      the shared frame moves, its input and volume continue, and the reverse restores the clips.
- [x] Verify refusal during the masked switch restores the outgoing artwork and mixer state.
- [x] Capture the masked switch on a local reference engine at 25 fps. The departing picture
      and mask disappear together before the retained frame grows to full raster.
- [x] Build and verify the three local Windows 1.2.5 installers from `e798ca3b`.
- [x] Rehearse preset and source transitions in PVW and verify no playout commands are sent.
- [x] Animate arriving and departing plates. Confirm the owner's `3ghab-crop.vcg` in both
      directions on the local reference engine, including the mask fragments and the retained
      shot's movement. Verify title visibility by preset in the rendered pages.
- [x] Verify Cut and Fade for an input swap, rollback on refusal, and cleanup after AMCP reconnect.
      A local reference-engine capture shows a dissolve in both directions inside the same frame.
- [x] Disable operator Crop for mask-owning plates while retaining Crop on eligible unmasked plates.
- [x] Verify Bounce and Elastic move phases and their Fade combinations in the phase planner.
      Windows Chromium verifies the Bounce replay in PVW. Bridge integration verifies the native
      mixer phases for both effects and the final recentered geometry.
- [x] Verify the expanded transitions with eight focused Windows Chromium cases.
- [ ] Record the Linux Playwright result for the expanded transitions.
- [ ] Build the updated local Windows installers after the expanded transitions pass.
