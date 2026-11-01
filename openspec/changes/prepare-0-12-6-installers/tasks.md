# Tasks — 0.12.6 installer candidate

Lane: **FULL**

## 1. Candidate identity

- [x] 1.1 File `P-074` and this OpenSpec change.
- [x] 1.2 Move all release-version sources to `0.12.6`.
- [x] 1.3 Strict-validate the change.

## 2. Current guide evidence

- [x] 2.1 Update the Persian guide for local service access and direct-UNC administration.
- [ ] 2.2 Build and visually verify the `0.12.6` PDF guide.
- [ ] 2.3 Replace version-bearing setup images with fresh captures from this build.
- [x] 2.4 Increase guide line/paragraph spacing and visually inspect every rendered page.

## 3. Product identity and station path

- [x] 3.1 Give Bridge a distinct teal executable/tile icon and give all three Setup products distinct
      audited dark grounds.
- [x] 3.2 Put the real package version in a prominent badge on both startup splashes.
- [x] 3.3 Add the CG Control Shared files section, typed channels, Bridge-side validation/persistence,
      and mock/live parity.
- [x] 3.4 Keep the locked-delimiter tooltip anchored to the content-sized delimiter Tag (`B-358`).
- [x] 3.5 Disable shared Scale while any selected Live Source is aspect-locked, including mixed
      Live Source + shape selections (`B-359`).
- [x] 3.6 Add symmetric, aspect-preserving Live Source auto-layout with independent gaps,
      horizontal/vertical two-plate modes, seat swapping, top/bottom remainder choice and
      single-step Undo (`B-360`).
- [x] 3.7 Add optional side-by-side primary/backup programme monitoring with one explicit local
      sound/VU source (`R-104`, `monitor-backup-program-return`).
- [x] 3.8 Keep the blue single/multi selection indication readable beside the red dashed overlap
      mark without changing selection geometry (`B-361`).
- [x] 3.9 Remove Live Source rotation zones from the canvas and refuse the gesture at its entry
      point (`B-362`).
- [x] 3.10 Disable single-selection Scale while the Live Source aspect lock is enabled (`B-363`).
- [x] 3.11 Synchronize registered Look/composition display names from the Look Inspector,
      Compositions panel/context menu, and open-composition Scene Inspector; prove CG Control's
      exported label (`B-364`).
- [x] 3.12 Keep the Auto source-id control reversible after confirming a generated id, while a
      newly typed id remains authored (`B-365`).

## 4. Verification

- [ ] 4.1 Run the full local gate and complete local E2E lane.
- [ ] 4.2 Push the exact candidate to `dev` and record green Linux workspace/E2E jobs.
- [ ] 4.3 Record a green Desktop installer run, including least-privilege text-root access and
      upgrade repair.

## 5. Handoff

- [ ] 5.1 Download and assemble the three exact installers and `SHA256SUMS.txt` in
      `installers-ci-0.12.6/` and place the latest installers in `dist/`.
- [ ] 5.2 Record exact filenames, sizes, hashes and the Desktop run URL; keep the candidate unpublished.
