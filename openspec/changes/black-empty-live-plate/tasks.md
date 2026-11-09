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
