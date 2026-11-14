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
- [ ] Record the carrying Linux Playwright result.
- [ ] Verify picture, title, fallback and mask alignment on the target Playout Engine.
- [x] Carry effect selection and authored frame identity into the on-air preset switch.
- [x] Verify both directions between a one-frame and a two-frame preset, with the shared producer
      retained. Windows Chromium and a Bridge smoke test with the owner's `3ghab-composition.vcg`
      passed. The masked variant used Cut when a move crossed the departing plate with reversed
      native paint order.
- [ ] Build the Windows installers locally after verification.
