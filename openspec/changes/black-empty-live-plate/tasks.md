## 1. Authoring and routing

- [x] 1.1 Use the existing Live Source picker for Bars/solid colour/picture, with a real Bars thumbnail and Bars as the legacy default.
- [x] 1.2 Render the selected fallback in the graphics bed underneath the external live producer.
- [x] 1.3 Carry Bridge-resolved source aspect/fit facts to the page and size the fallback to the producer's visible fit.
- [x] 1.4 Include selected fallback pictures in export packaging and preserve unavailable-source preflight/refusal.
- [x] 1.5 Seed new plates with Bars and share the same authoring picker across one or many selected plates.

## 2. Verification

- [x] 2.1 Add schema, DOM, export, runtime-fit and Bridge integration coverage.
- [x] 2.2 The full pre-push gate passed on `d6383de0`.
- [ ] 2.3 Run a real CasparCG/Playout on-air pass.
- [x] 2.4 Chromium verified Bars on a new plate, its thumbnail and a selectable solid colour.
- [x] 2.5 Multiple-selection tests verified the shared picker and Undo.

## 3. PVW fallback and fit label

- [x] 3.1 B-424 — leave the retained fallback visible and show Crop edges below the plate name.
- [x] 3.2 Chromium verified the exported solid and Bars backgrounds, Crop edges, and both marker states.
- [x] 3.3 Remove the general PVW stamp and show the live-source note only when a plate label would clip.
- [x] 3.4 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42568697446/job/129000870086)
      passed on `665668e4`.

## 4. Optional plate background

- [x] 4.1 Add Show fallback to the shared Designer control and preserve the selected background.
- [x] 4.2 Let the selected background fill the uncovered region around a contained picture. Leave it
      transparent when disabled and preserve the Bridge's picture FILL/CLIP and input assignments.
- [x] 4.3 Chromium verified transparent on-air export when disabled and preservation of the chosen colour.
      All 29 focused template-runtime tests and 22 Designer Inspector tests passed.
- [x] 4.4 Verify on local CasparCG 2.5.0. Sampled the full fallback before the first frame, the
      uncovered margin, loss and recovery without a new take, and transparent margins with the
      option off. A preset with an unfed UDP input showed the selected solid fallback and switching
      back restored the prior picture.
- [ ] 4.5 Verify on the target Playout. Confirm signal reporting for an in-place source swap whose
      new producer has no first frame. Local CasparCG can keep the outgoing picture in this case.
- [x] 4.6 The full pre-push gate and [carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42582556024/job/129044614984)
      passed on `0a553a24`.

## 5. Scope the fallback toggle to PGM

- [x] 5.1 Keep the authored fallback in Designer and PVW with Show fallback on air off.
- [x] 5.2 Chromium verified Canvas, Rehearse, Preview and the same retained page played in PVW and output.
- [x] 5.3 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42701892701/job/129448618037) passed on `88cfa392` for the PGM-only toggle.
- [ ] 5.4 Verify the toggle on the target station.

## 6. Align fractional edges on PGM

- [x] 6.1 Reproduce the owner report in direct station return and in an isolated CasparCG 2.5.0 fixture.
- [x] 6.2 Verify full-fit raster edge alignment, true contain margins and unchanged crop identity.
- [x] 6.3 The aligned local native commands replaced row 963's Bars with the live picture and kept row 964 outside the plate.
- [ ] 6.4 Verify on the target station with an updated Bridge.
- [x] 6.5 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42713157816/job/129487812167)
      passed on `e134f56b` for the half-pixel edge correction.

## 7. Preset switch fallback flash

- [x] 7.1 Reproduce page-first exposure in isolated CasparCG 2.5.0. The incoming fallback pixel
      appeared before the live picture moved. Holding that fallback hid it until the switch,
      and clearing the source after release exposed the same authored colour.
- [x] 7.2 Chromium sampled the foreground, held fallback, released fallback and a missing
      picture in the exported page. The Bridge wire tests covered the output tick, rollback
      and a refused mixer commit.
- [x] 7.3 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42727985027/job/129538550944)
      passed on `e5474cc1` for the exported preset-switch handoff.
- [ ] 7.4 Verify the switch on the target station with an updated Bridge and retained page.
