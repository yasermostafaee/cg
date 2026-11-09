## 1. Authoring and routing

- [x] 1.1 Use the existing Live Source picker for Bars/solid colour/picture, with a real Bars thumbnail and Bars as the legacy default.
- [x] 1.2 Render the selected fallback in the graphics bed underneath the external live producer.
- [x] 1.3 Carry Bridge-resolved source aspect/fit facts to the page and size the fallback to the producer's visible fit.
- [x] 1.4 Include selected fallback pictures in export packaging and preserve unavailable-source preflight/refusal.
- [x] 1.5 Seed new plates with black and share the same authoring picker across one or many selected plates.

## 2. Verification

- [x] 2.1 Add schema, DOM, export, runtime-fit and Bridge integration coverage.
- [x] 2.2 The full pre-push gate passed on `d6383de0`.
- [ ] 2.3 Run a real CasparCG/Playout on-air pass.
- [x] 2.4 Chromium verified black on a new plate, the decoded Bars thumbnail and the selected
      Bars choice in the export. Multiple-selection tests verified the same picker and Undo.
