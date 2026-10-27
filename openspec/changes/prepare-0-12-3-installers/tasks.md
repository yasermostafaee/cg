# Tasks — 0.12.3 installer candidate

Lane: **FULL**

## 1. Candidate identity

- [x] 1.1 File `P-071` and this OpenSpec change.
- [x] 1.2 Move all release-version sources and the regression pin to `0.12.3`.
- [x] 1.3 Add the Persian `0.12.3` guide and require all three installers over `0.12.2`.
- [x] 1.4 Strict-validate the change and build/test the guide.

## 2. Verification

- [x] 2.1 Run the full local gate.
- [x] 2.2 Run the complete local E2E lane.
- [x] 2.3 Push the exact candidate to `dev` and record green Linux workspace and E2E jobs.
- [x] 2.4 Record a green Desktop installer run, including the `0.11.6` upgrade acceptance.

## 3. Handoff

- [x] 3.1 Download and assemble the three exact installers and `SHA256SUMS.txt` in
      `installers-ci-0.12.3/` and place the latest installers in `dist/`.
- [x] 3.2 Record exact filenames, sizes, hashes and the Desktop run URL; keep the candidate unpublished.
