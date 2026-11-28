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
- [x] Save and render a rectangular per-plate border with editable color and width.
- [x] Verify preset and per-plate aspect and fit in saved packages and Windows Chromium, including a 3:4 center crop and the same input in a 16:9 solo preset.
- [x] The carrying [Linux E2E step](https://github.com/yasermostafaee/cg/actions/runs/44128971338/job/134201941267)
      passed on `ca38e1551cb4f261101ea7f0e264c7d1b7e81348`, including authored preset/plate crop,
      rectangular border visibility, operator crop/placement/mask permissions, and editor/PVW previews.
- [ ] Verify the Designer-authored masked input and attached graphic together on the target Playout Engine.
- [x] Verify direct NDI and routed pictures in the selected editor preset and through a preset switch.
      Windows Edge decoded direct NDI pixels and rendered DeckLink snapshots inside their assigned plates.
      The native canvas kept the correct aspect, and the pictures returned to the matching frames when
      the operator returned to the two-input preset.

## Local video transport in Preview

- [x] Reuse the PVW plate player for eligible video in the live-layout editor.
- [x] Add a browser scenario for manual Play, Pause and Reset.
- [x] Windows Chromium verified manual Play, Pause and Reset in the editor with no automatic playback or Take.
- [x] Verify a mixed NDI and media preset uses separate preview transports, and Layout effects opens from the Plate tab. Windows Chromium passed.
- [x] Verify Arrange Reset restores the selected preset's factory values and preserves the assigned NDI input and clip. Windows Chromium passed.
- [x] Windows Chromium decoded both draft plate posters before Play; the existing manual editor and PVW checks also passed.
- [ ] Record the Linux E2E run.

## Linked plates across presets

- [x] Windows Chromium verified that the masked overlay follows its base through different preset sizes and placements, disappears without the base, and preserves geometry after Save, Edit and PVW Play.
- [x] Sampled the relative bounds of the mask, border, title and graphic during preset switches in Windows Chromium.
- [x] The compiler round-trip and Bridge AMCP mock verified preset and Focus geometry, independent source bindings, mask and native Programme layer order.
- [x] The AMCP mock verified matching mixer easing and pacing for plate and mask through a preset resize, Focus and Return, with the corresponding artwork frame motion.
- [x] Verify B-460. Windows Chromium confirmed focus filtering, base Focus switches, Return with the linked mask, and the Overlay on position in the editor and PVW. Programme component tests covered the Focus strip. The Bridge AMCP mock verified no-wire refusal of the overlay Focus, on-air recovery to a base Focus, and restoration of an older off-air selection.
- [x] Windows Chromium verified B-462 at zero horizontal and vertical gap. The outline stays inside the stage and above adjacent shots. Zero gap preserves margins and Add preset focuses the name in Preset.
- [ ] Record the target Playout and carrying Linux results.
