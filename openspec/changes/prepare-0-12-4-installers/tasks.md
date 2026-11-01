# Tasks — 0.12.4 installer candidate

Lane: **FULL**

## 1. Candidate identity

- [x] 1.1 File `P-072` and this OpenSpec change.
- [x] 1.2 Move all release-version sources and the regression pin to `0.12.4`.
- [x] 1.3 Strict-validate the change.

## 2. Current guide evidence

- [x] 2.1 Run Desktop on the temporary candidate branch to obtain real setup and app screenshots.
- [x] 2.2 Add and build the Persian `0.12.4` guide with screenshots from this build.
- [x] 2.3 Prove every quoted label is current and every version-bearing image is fresh.

## 3. Verification

- [x] 3.1 Run the full local gate.
- [x] 3.2 Run the complete local E2E lane.
- [x] 3.3 Push the exact candidate to `dev` and record green Linux workspace and E2E jobs.
- [x] 3.4 Record a green Desktop installer run, including the installed Designer ACL smoke and the `0.11.6` upgrade acceptance.

## 4. Handoff

- [x] 4.1 Download and assemble the three exact installers and `SHA256SUMS.txt` in
      `installers-ci-0.12.4/` and place the latest installers in `dist/`.
- [x] 4.2 Record exact filenames, sizes, hashes and the Desktop run URL; keep the candidate unpublished.
