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
- [x] 4.3 Chromium verified toggling off, transparent export and restoring the chosen colour.
      All 29 focused template-runtime tests and 22 Designer Inspector tests passed.
- [ ] 4.4 Record the full gate and Linux E2E. Verify the uncovered region on Playout.
