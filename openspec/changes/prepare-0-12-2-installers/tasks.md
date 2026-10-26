# Tasks — 0.12.2 installer candidate

Lane: **FULL**

## 1. Record the candidate

- [x] 1.1 File `P-070` and register the identifier
- [x] 1.2 Author the proposal, design, desktop-delivery delta and evidence checklist
- [x] 1.3 Strict-validate the active change

## 2. Version and guide

- [ ] 2.1 Move all nine release-version sources and the release-version regression pin to `0.12.2`
- [ ] 2.2 Add the Persian `0.12.2` guide with exact filenames: all three are applied over the owner's `0.11.6`;
      over a complete `0.12.1` set, CG Bridge and CG Control are required and Designer is optional
- [ ] 2.3 Run preliminary `guide-shots` from a pushed `0.12.2` ref, replace the version-bearing pictures and
      record that run URL here
- [ ] 2.4 Build and test the final guide, including its version-bearing text and image references

## 3. Gates and final Windows build

- [ ] 3.1 Run the full local gate and retain its green log reference
- [ ] 3.2 Push the complete candidate to `dev`; record the completed green Linux CI and E2E run URL
- [ ] 3.3 Run Desktop on that exact commit through the final installer marker or a manual dispatch; record the
      completed run URL and prove every applicable installer, smoke and acceptance job ran and passed, including
      `acceptance-upgrade-0116`

## 4. Handoff and closure

- [ ] 4.1 Download CG Control, CG Designer and CG Bridge from the final Desktop run and assemble their
      release-named files, the final PDF and `SHA256SUMS.txt` in untracked `installers-ci-0.12.2/`
- [ ] 4.2 Record all three exact filenames, byte sizes and SHA-256 hashes from the final Desktop run
- [ ] 4.3 Hand over all three for the owner's `0.11.6` upgrade; note that only CG Bridge and CG Control are
      required when a station already has the complete `0.12.1` set
- [ ] 4.4 Confirm no tag, draft release or published release was created; archive only after owner confirmation
