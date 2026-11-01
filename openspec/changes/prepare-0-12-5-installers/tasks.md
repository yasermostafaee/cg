# Tasks — 0.12.5 installer candidate

Lane: **FULL**

## 1. Candidate identity

- [x] 1.1 File `P-073` and this OpenSpec change.
- [x] 1.2 Move all release-version sources to `0.12.5`.
- [x] 1.3 Strict-validate the change.

## 2. Current guide evidence

- [x] 2.1 Capture the updated Bridge Setup page from this build.
- [x] 2.2 Add and build the Persian `0.12.5` guide with the shared-folder step.
- [x] 2.3 Prove every quoted label is current and every version-bearing image is fresh.

## 3. Verification

- [x] 3.1 Run the full local gate and complete local E2E lane.
- [x] 3.2 Push the exact candidate to `dev` and record green Linux workspace/E2E jobs.
- [x] 3.3 Record a green Desktop installer run, including shared-text-root setup/silent smoke and the
      `0.11.6` upgrade acceptance.

## 4. Handoff

- [x] 4.1 Download and assemble the three exact installers and `SHA256SUMS.txt` in
      `installers-ci-0.12.5/` and place the latest installers in `dist/`.
- [x] 4.2 Record exact filenames, sizes, hashes and the Desktop run URL; keep the candidate unpublished.
