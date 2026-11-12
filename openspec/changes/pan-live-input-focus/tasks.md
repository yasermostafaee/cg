# Tasks — pan a cropped live input (D-178)

## 1. Contract and carrier

- [x] 1.1 Add a bounded optional normalized focus to the plate and runtime declaration
- [x] 1.2 Carry focus per look without creating a second per-source home
- [x] 1.3 Preserve old centred behaviour when focus is absent and ignore it for `contain`

## 2. Authoring and output

- [x] 2.1 Remove Designer's percentage controls and preserve saved focus values
- [x] 2.2 Record the feasibility and contract dependencies of direct CG Control dragging
- [x] 2.3 Apply focus to Bridge `FILL` through the shared live-source geometry
- [x] 2.4 Preserve the scoped relative crop operation for existing 1.1.0 consoles.
- [x] 2.5 Add PVW crop editing on the 2.18.17 source-preview JPEG and paired geometry.
      Use the [new mapping](../../../docs/integration/playout/source-previews-2.18.17-adoption.md)
      and validate it against the Bridge seating plan. The legacy MJPEG has no geometry mapping.
- [x] 2.6 Show Crop edges below the Plate name and keep the name's screen size independent of fit and zoom
- [x] 2.7 Expose a local PVW practice image for operator review
      before Playout supplies the active source rectangle and sample aspect ratio.

## 3. Verification

- [x] 3.1 Cover schema bounds, both fit modes, per-look carrier, wire parse and existing-project compatibility
- [x] 3.2 Package checks and the full pre-push gate passed on `d6383de0`.
- [ ] 3.3 Verify crop focus on a real input in the target plant.
- [x] 3.4 [Carrying Linux E2E for the implemented Designer and PVW labels](https://github.com/yasermostafaee/cg/actions/runs/42568697446/job/129000870086)
      passed on `665668e4`.
- [x] 3.5 Verify the PGM drag gesture against the ticketed MJPEG return and scoped mixer update in
      Chromium, with the clip, producer and volume preserved.
- [x] 3.6 Verify the same crop on local CasparCG 2.5.0 with a two-colour picture. The sampled pixel
      inside the plate changed from green to red after the pan. The outside pixel and clip were
      unchanged.
- [x] 3.7 The full pre-push gate and [carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42582556024/job/129044614984)
      passed on `0a553a24`, including the PGM drag in the built CG Control.
- [x] 3.8 Verify the always-visible tools and practice drag at idle and with a Crop edges plate.
      The focused local Chromium tests passed, including the scoped PGM command.
- [x] 3.9 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42676776212/job/129360266303)
      passed on `40974e03` for the initial monitor controls. The PVW-only revision is tracked below.

## 4. Owner review

- [x] 4.1 Show the complete practice image and moving crop guide within the PVW plate and offer Center.
- [x] 4.2 Remove the PGM Pan action and guides. Revisit the PGM interaction if the owner asks for it.
- [x] 4.3 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42689856329/job/129406540835) passed on `9dd4b023` for the PVW-only workflow and monitor layout.

## 5. Aspect and eligibility review

- [x] 5.1 Disable the PVW practice action when the current picture has no visible Crop edges plate.
- [x] 5.2 Keep the full practice source proportional and move the plate-shaped crop only along
      the overflowing axis. Focused Chromium cases passed for wide and portrait plates, and
      the shared fit test passed for a 4:3 source in a 16:9 plate.
- [x] 5.3 Show an accent-filled, pressed Pan toggle in the PVW header while editing.
- [x] 5.4 Verify horizontal and vertical practice drags and Center in Chromium.
- [x] 5.5 Strengthen the blue PVW Pan guide around the crop with a dark contrast edge.

## 6. PVW crop handoff to Take

- [x] 6.1 Carry an authenticated row-scoped crop read and save using the existing seating plan.
- [x] 6.2 Persist accepted edits for the matching look, plate and input, and preserve the rehearsal interlock.
- [x] 6.3 Draw and save the proportional guide when known geometry is available. Keep practice for unknown geometry or older Bridges.
- [x] 6.4 Chromium and Bridge checks passed for restoring the guide, isolating stale scopes, and applying the crop in the first FILL before reveal on Take.
- [x] 6.5 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42727985027/job/129538550944)
      passed on `e5474cc1` for the PVW crop workflow.
- [x] 6.6 Verify an older compatible Bridge keeps Pan in practice mode without a crop request or a global warning for that optional capability.

## 7. Apply the crop through Inspector

- [x] 7.1 Draft Drag and Center in the row, preserve across OFF PVW and restore the applied value on Discard.
- [x] 7.2 Validate and save the row's crop drafts in a single Bridge batch on Update. Allow an off-air save after OFF PVW.
- [x] 7.3 Keep generic practice on the existing browser session and preserve it through PVW toggles.
- [x] 7.4 Verify the Inspector draft, OFF/ON PVW, Discard, Update and first FILL before reveal in Chromium.
- [x] 7.5 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42701892701/job/129448618037) passed on `88cfa392` for Inspector crop saving.
- [x] 7.6 Keep the Center button readable at a fixed screen size and verify its hitbox in Chromium.

## 8. Measured source picture

- [x] 8.1 Validate and forward active JPEG geometry. Use the actual picture in Pan only when it
      matches the canonical Take target. Preserve guide-only operation and stable crop draft identity.
- [x] 8.2 The focused authenticated Bridge and fresh Chromium tests verified the measured JPEG
      bounds, stable same-revision samples, stale-gesture cancellation and Bars fallback.
- [x] 8.3 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42727985027/job/129538550944)
      passed on `e5474cc1` for measured source pictures in Pan.
- [ ] 8.4 Verify the same source and crop in PVW and first Take on the target station.

## 9. Resize the PVW crop

- [x] 9.1 Add backwards-compatible framing magnification, deriving the editor window and FILL from one fit.
- [x] 9.2 Resize proportionally from each corner, keep the source in bounds, and preserve size on Center.
- [x] 9.3 Save size with position through Inspector Update and use it in the first hidden FILL.
- [x] 9.4 Verify matching-aspect sources, clamp, draft/restore and the retained crop in Chromium and Bridge tests.
      The browser verified a proportional resize and reopening the applied crop. The wire test
      verified no AMCP on Update and the matching hidden FILL with the original CLIP on first Take.
- [x] 9.5 Verify the carrying [Linux Playwright E2E](https://github.com/yasermostafaee/cg/actions/runs/42873144431/job/130029489197) on `c560f8cd`.
- [ ] 9.6 Verify a resized crop on first Take on the target station.

## 10. Pan selection and Update on air (B-433)

- [x] 10.1 Keep the selected source clear and draw checkerboard outside the crop. Chromium verified
      the selected and excluded JPEG pixels.
- [x] 10.2 Apply a verified crop from Update on air to the existing seat. Chromium and Bridge
      verified the first Take, the live FILL, the retained clip and transport, and refusal rollback.
- [x] 10.3 The carrying [Linux Playwright E2E](https://github.com/yasermostafaee/cg/actions/runs/42940842882/job/130262075512) passed on `f071406b`.
- [x] 10.4 The owner verified that resizing updates PGM on the target station.
- [x] 10.5 Windows Chromium verified that the source and checkerboard pixels remain stable over the plate and corner, including a stationary press. All six focused Pan scenarios passed.
- [x] 10.6 The carrying [Linux Playwright E2E](https://github.com/yasermostafaee/cg/actions/runs/43012308177/job/130494823472) passed on `349544ee`. The station visual check remains in 10.9.
- [x] 10.7 Show the assigned PVW input across the fitted source area, including when exact JPEG geometry
      is unavailable. Paint checkerboard in unused plate margins and dim the surrounding source during drag and resize.
- [x] 10.8 In Chromium, verify that refreshed input fills the source area, checkerboard stays in unused
      margins, both gestures dim only the image outside the crop, and hover and release restore the idle paint.
- [ ] 10.9 Verify the corrected Pan presentation with the assigned inputs on the target station.

## 11. Render the applied crop with Pan closed

- [x] Use the saved crop for the current verified plate, source and look in normal PVW.
- [x] Windows Chromium verified the saved off-air crop and matched the updated on-air FILL
      to the PVW picture after closing Pan, without additional playout commands.
- [x] The carrying [Linux Playwright E2E step](https://github.com/yasermostafaee/cg/actions/runs/43060000125/job/130659729029) passed on `edcbe428` after `9e67b0a8`.

## 12. Reset crop from Inspector

- [x] Restore authored framing only for the requested preset and clear its overrides after acceptance.
      Six focused Bridge cases passed.
- [x] Windows Chromium verified the Inspector reset with Crop input closed, immediate PVW
      restoration, Discard, and Update on air on the same input seat.
- [x] Disable Reset crop for the authored crop and when a reset is already staged. Verify
      that a saved or staged deviation in another preset does not enable it.
- [ ] Verify Reset crop on the target station and record carrying Linux Playwright.

## 13. Crop input visibility

- [x] Show Crop input only for an eligible Crop edges plate on PVW. Windows Chromium verified
      the empty and contain-only cases and the disabled state before Preview Play.

## 14. Reframe after a compatible template replacement

- [x] Windows Chromium verified Crop input and Reset crop after a replacement import while the
      original input stays on air. A crop-only Update sends mixer geometry without an empty CG UPDATE.
- [x] Bridge verified that changed authored framing refuses a live reset before a mixer write
      and compatible framing still supports a rollback after a mixer refusal.
