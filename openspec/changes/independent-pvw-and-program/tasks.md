# Tasks

- [x] Separate browser-only PVW from the legacy rehearsal entry in the contract.
- [x] Bridge integration verified independent entry and exit emit no CG/MIXER, Take keeps applied values, explicit Update reaches CG, Stop/Clear retain PVW and the legacy interlock still applies to legacy rehearsal.
- [x] Chromium with a real Bridge and mock AMCP verified both buttons, immediate Inspector drafts in PVW, Play taking the applied values, and the on-air draft reaching AMCP only after explicit Update on air.
- [x] The full local gate and carrying [Linux Playwright E2E](https://github.com/yasermostafaee/cg/actions/runs/42873144431/job/130029489197) passed on `c560f8cd`.
- [ ] Check concurrent Preview and Program on the target station.
- [x] Chromium verified ON PVW precedes Play and aligns to its heading. Layers has no Remove All button. Individual Remove, Stop All and Clear All remain available under their existing guards.
- [x] Chromium verified live Position staging in PVW, one CG UPDATE for fields and position, and in-place movement of the served page. Bridge tests verified applied state and position-only payloads.
- [x] Chromium and Bridge verified unsupported pages stay locked. Bridge also verified stale occupancy and backup refusal, restoration of eligibility on a fresh observation, and retained applied state after rejection.
- [x] Bridge integration held the off-air Update acknowledgement across a confirmed sweep and verified legacy rehearsal stays active with no change to layer volume.
- [ ] Record carrying Linux E2E and test live Position on the target station.
- [x] Show a separate labelled outline for each retained template before Preview Play and after Preview Stop.
- [x] Drag an eligible template to stage its existing Inspector Position, with channel scaling and separate Pan gestures.
- [x] Chromium verified two outlined pages, row selection, local-only drag, off-air Update, outline removal and existing layered video pixels.
- [ ] Verify template outlines and Position dragging on the target station.
- [x] Add **Reset position** to the Position section using the existing draft and Update actions.
- [x] Verify off-air reset and delayed acknowledgement in unit tests. Windows Chromium verified
      authored placement in PVW, Discard, and explicit Update on air through a real Bridge.
- [ ] Record the carrying Linux Playwright result for Position reset.
- [x] Gate whole-template dragging behind the PVW **Move template** toggle and keep outlines available.
- [x] Verify in Windows Chromium that **Move template** starts off, toggles dragging, and preserves completed drafts for Update or Discard.
- [ ] Record the carrying Linux Playwright result for the **Move template** toggle.
- [x] Show a Position-only draft in the layer row's existing badge and on-air Update action.
      All 46 focused Runtime tests passed.
- [x] Verify the row's draft badge during Position editing, Discard and Update in Windows Chromium.
- [x] Move supported resident live layouts with their visible seats during Update on air.
- [x] Verify that a mixed on-air Update applies fields and source bindings, the staged crop and
      Position in order and retains rejected or unsent drafts. All 30 focused Runtime tests passed.
- [x] Verify whole-template Position in Windows Chromium with a real test Bridge and mock engine.
      The focused seven cases passed, including live seat translation and supported-page guards.
- [x] Verify five focused Bridge cases covering visible and parked seats, paired foreground,
      saved crops across Looks, rollback and fully off-raster refusal.
- [ ] Verify Position for a live layout on the target station and record carrying Linux Playwright.
- [x] Put **Move template** before **Crop input**, followed by **Edit frames** when available.
- [x] Verify the new PVW tool order in normal and compact layouts in Windows Chromium. Six focused
      cases passed, including the real-Bridge live Position and crop scenarios.
- [x] Verify the one-row PVW tools with the Inspector open in normal 1280px and maximized
      620px layouts. Windows Chromium confirmed the icon-only controls keep their hitboxes.
