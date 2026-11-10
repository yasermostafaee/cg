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
