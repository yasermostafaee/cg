## 1. Implementation

- [x] 1.1 Show frame-size counts and offer the two import choices.
- [x] 1.2 Initialize editable output dimensions from the first readable frame and check the chosen size before Continue.
- [x] 1.3 Normalize the selected frames, retain alpha, and carry the settings into asset provenance and duplicate detection.

## 2. Verification

- [x] 2.1 Cover the first-step choices, edited size, held slots and budget refusal. All 40 planning and modal tests passed.
- [x] 2.2 Verify converted pictures, transparent padding, frame timing and dedupe in Chromium. The Windows browser batch passed all six cases across both import entry points. The converter checks passed 78 tests. A separate run of the shipped FFmpeg core in Chrome decoded all five frames of both PNG and TGA fixtures at 60×40, preserving frame order and transparency.
- [ ] 2.3 Record carrying-commit Linux E2E evidence.
