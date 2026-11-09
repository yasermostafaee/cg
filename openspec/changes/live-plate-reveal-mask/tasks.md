# Tasks — live-plate reveal mask (D-202)

## 1. Contract and validation

- [x] 1.1 Allocate D-202 after reserving D-201 for live foreground overlays
- [x] 1.2 Add the bounded optional relation to scene, carrier and IPC schemas
- [x] 1.3 Keep ordinary overlap blocking and reject missing, self and cyclic relations

## 2. Authoring and output

- [x] 2.1 Add lower-plate selection, percentage inputs and Canvas rectangle drawing
- [x] 2.2 Carry the relation per look and show a non-output authoring guide
- [x] 2.3 Seat a clipped, always-muted lower copy above the upper producer
- [x] 2.4 Give the duplicate an independent ledger identity and atomic layer demand

## 3. Verification

- [x] 3.1 Cover schema bounds, carrier/wire survival and the narrow preflight exception
- [x] 3.2 Prove real Bridge wire order, geometry, duplicate identity and permanent mute in AMCP integration
- [x] 3.3 Package checks and the full pre-push gate passed on `d6383de0`.
- [ ] 3.4 Confirm FILL/CLIP behaviour on the target CasparCG plant

## 4. Multiple masks on the same Plate

- [x] 4.1 Extend the existing relation with optional extra windows and preserve one-window projects
- [x] 4.2 Add Inspector selection, per-mask geometry, Canvas add/redraw and individual removal
- [x] 4.3 Validate every mask and reserve a muted Bridge seat for each visible window
- [x] 4.4 Verify the editor, carrier and AMCP paths with two distinct windows
- [x] 4.5 B-423 — remove dependent masks on deletion and repair orphaned masks on open
- [x] 4.6 Verify delete, Undo and the reported previously saved project
- [x] 4.7 Verify labelled guides at two Canvas zoom levels and icon actions in the mask group
- [x] 4.8 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42568697446/job/129000870086)
      passed on `665668e4`.

## 5. Mask a single live plate

- [x] 5.1 Draw, edit and remove windows directly on one plate and keep the complement in Revert
- [x] 5.2 Carry the optional mask per look and clip the authored fallback in both modes
- [x] 5.3 Clip the original producer and route further disjoint fragments from its layer
- [x] 5.4 Read hidden-seat replies by their unique seat identity during a look switch
- [x] 5.5 Verify the authoring, export and Bridge paths with local CasparCG 2.5.0 and Chromium.
      Checked Mask, Revert and full-frame recovery by sampling output pixels, plus the reported
      linked reveal on preset 1 of the owner's package. Opened `ghab-test.cgproj` in Designer and
      exported both preset 1 and the main composition with all three presets.
- [ ] 5.6 Confirm the new mask on the target Playout.
- [x] 5.7 The full pre-push gate and [carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42582556024/job/129044614984)
      passed on `0a553a24`.

## 6. Direct Canvas editing

- [x] 6.1 Move and resize a selected own-plate or linked reveal window on the Canvas.
- [x] 6.2 Verify bounds, cancellation, Undo and independent windows in the two focused local Chromium cases.
- [ ] 6.3 Record the carrying Linux E2E result.
- [x] 6.4 Default to editing the selected mask and verify pressed styling, Add/Redraw, Escape and Canvas selection. All 24 Designer Live Source cases passed in local Chromium.
