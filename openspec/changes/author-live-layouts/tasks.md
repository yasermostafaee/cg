## Authoring

- [x] Build and persist a standard editable VCG package from the Control layout.
- [x] Add frame and preset management, shared effects and background media to the editor.
- [x] Verify a layout on air is protected and its duplicate can be saved with its own package and identity.

## Focus and Return

- [x] Verify independent Preview and guarded Programme Focus, Return, Motion, Push and Slide over.
- [x] Verify exact origin and input continuity in the Bridge tests, including A/B and a one-frame originating preset.
- [x] Verify Focus artwork translation, clipping and look cleanup in the page runtime, and verify the Push and Slide over phases precede their native mixer commits on the active engine.
- [x] Windows Chromium: `control-live-layout.spec.ts` passed for authoring, independent PVW/PGM, Designer catalogue compatibility, and preparing a second layout while the first is on air.
- [x] Linux Playwright `E2E` passed on [`875d5fe6`](https://github.com/yasermostafaee/cg/actions/runs/43706081250/job/132795662584).
- [ ] Verify effects on the target Playout Engine.

## Operator feedback

- [x] Verify Cut and stationary Fade in Chromium and Bridge's A/B mock, with both physical seat orders.
- [x] Verify editable title position, size, font and background in the editor and compiled layout.
- [x] Verify per-preset gap controls, native input styling, and compact Focus/Return in Chromium and the standalone HTML review.

## Shared title styles and rehearsal

- [x] Persist a shared style, per-frame overrides and uploaded fonts in the VCG.
- [x] Edit title box sizing, padding, typography, alignment, wrapping, stroke, shadows and corner radius.
- [x] Make selected presets and frames distinct and give the modal a larger responsive preview.
- [x] Verify configured solo switch effects in editor rehearsal, PVW and the existing AMCP mock for PGM.
- [x] Verify a styled layout and its uploaded font after Save, Edit and Duplicate.
- [x] Verify hidden Focus titles stay absent in the editor and PVW and restore on Return.
- [x] Verify the Advanced Digits control in authoring, the VCG and PVW.
- [x] Verify Advanced frame controls persist fit, permissions and masks for every preset and Focus.
- [x] Windows build `bf51a5d7` passed packaged Bridge and Control smoke, retained VCG/font verification, application stamp checks, and installer checksums.
- [x] Verify a Focus alias and a chosen frame slot in the editor, PVW and PGM.
- [x] Verify additional text values, styles, and bindings survive Save and Duplicate.
- [x] Linux Playwright E2E passed for advanced frame controls, titles, fonts, digits and rehearsal on [bf51a5d7](https://github.com/yasermostafaee/cg/actions/runs/43719150757/job/132827188641#step:13:1).
- [x] Linux Playwright E2E and the Linux gate passed for Focus labels, arbitrary preset positions and additional text on [e5d44f80](https://github.com/yasermostafaee/cg/actions/runs/43724416876/job/132843185179#step:13:1). The local Windows installer stamps, checksums and staged native smoke passed on the same build.
- [x] Match the requested title defaults and give additional text shared and individual style scopes.
- [x] Verify preset and solo motion in the editor and PVW, default placement locks, retained source images, and drag/resize of a direct rectangular mask in Chromium.
- [x] Add multiple ordered still-art VCG attachments and one masked source per shared frame, with direct manipulation and self-contained storage.
- [x] Verify stable frame graphics identity and mask across presets and Focus, preserving older scoped packages.
- [x] Verify an empty editor, steady Start with this preset, Arrange in the main scroll, and Focus controls for every frame in Windows Chromium.
- [x] Verify Background None preserves transparency in authored presets and Focus and survives Save and Edit.
- [x] Carry the input catalogue server through successful D10 reads, refresh failures and Bridge restarts.
- [x] Verify vertical stereo input meters, frame-height rails when enabled, a default-off editor preview, and no meters on media in Chromium.
- [x] Align New live layout labels with Designer's Plate terminology.
- [x] Save and render a per-plate border with editable color, width and radius.
- [ ] Verify the Designer-authored masked input and attached graphic together on the target Playout Engine.
