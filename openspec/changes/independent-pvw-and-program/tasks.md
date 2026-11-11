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
