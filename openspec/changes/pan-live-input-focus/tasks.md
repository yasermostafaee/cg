# Tasks — pan a cropped live input (D-178)

## 1. Contract and carrier

- [x] 1.1 Add a bounded optional normalized focus to the plate and runtime declaration
- [x] 1.2 Carry focus per look without creating a second per-source home
- [x] 1.3 Preserve old centred behaviour when focus is absent and ignore it for `contain`

## 2. Authoring and output

- [x] 2.1 Remove Designer's percentage controls and preserve saved focus values
- [x] 2.2 Record the feasibility and contract dependencies of direct CG Control dragging
- [x] 2.3 Apply focus to Bridge `FILL` through the shared live-source geometry
- [x] 2.4 Add scoped crop editing on the live PGM return
- [ ] 2.5 Add local PVW crop editing on the accepted C-023 live input feed
      C-023 supplies one live picture. Its JPEG is in the Preview channel raster, and the
      handoff does not identify the source's active picture rectangle or sample aspect ratio.
      Request the mapping needed for accurate staged drag in
      [the Playout follow-up](../../../docs/integration/playout/CG-CONTROL-REQUEST-LIVE-INPUT-PREVIEW-2026-10-26.md).
- [x] 2.6 Show Crop edges below the Plate name and keep the name's screen size independent of fit and zoom
- [x] 2.7 Keep Pan visible on both monitors and expose a local PVW practice image for operator review
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
- [ ] 3.9 Record carrying Linux E2E for the new controls.

## 4. Crop overview

- [x] 4.1 Carry the token-scoped source geometry and apply Center through the existing Bridge operation.
- [x] 4.2 Show the complete practice image in PVW and the geometry map in PGM. Update the
      crop guide during the gesture and apply PGM on release.
- [x] 4.3 Verify Center, local pointer motion, stale-token refusal and compatibility with relative drags.
      Focused shared-schema, IPC, Bridge and Chromium checks passed.
- [ ] 4.4 Show the actual uncropped live source in PGM once Playout exposes it safely.
- [ ] 4.5 Record carrying Linux E2E and verify the overview on the station's updated Bridge.
