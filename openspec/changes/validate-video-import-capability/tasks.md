# Tasks — validate-video-import-capability

## 1. Contract

- [x] 1.1 Register B-383 and D-190 in PRD/OpenSpec.
- [x] 1.2 Define the extension, decode-proof and square-pixel geometry boundaries.
- [x] 1.3 Define explicit picture-shape and QTRLE/VLC colour compatibility recipes.

## 2. Implementation

- [x] 2.1 Expose proven format guidance before selection and improve immediate extension refusal.
- [x] 2.2 Require fallback frame decode before a poster-less source becomes ready.
- [x] 2.3 Parse sample-aspect ratio and normalize preview, crop mapping, conversion and verification.
- [x] 2.4 Bump converter provenance revision for the changed canonical bytes.
- [x] 2.5 Add live picture-shape and QTRLE colour choices, threaded through verification,
      provenance and dedupe.

## 3. Verification

- [x] 3.1 Add pure argument/parser tests for decode checks and non-square geometry.
- [x] 3.2 Add modal/reset tests proving early refusal and poster-less fallback success.
- [ ] 3.3 Run focused tests, Designer checks, strict OpenSpec and the full repository gate.
- [x] 3.4 Visually verify guidance and the supplied MOV in the local Designer.
- [x] 3.5 Verify both standard and VLC-colour previews/outputs with the supplied MOV.
