# Design — 0.12.5 installer candidate

## One matching set

The authoritative version sources, installer filenames, Installed apps, application surfaces and
CG Bridge health all derive from `0.12.5`; packaging refuses drift.

`B-357` changes CG Bridge and its setup wrapper. CG Control and Designer keep the fixed-file client
contract delivered in `0.12.4`, but the station is handed one matching three-installer set.

## Evidence sequence

1. Set the shared version and Persian guide to `0.12.5`.
2. Run the full local gate and E2E lane.
3. Push one installer-marked candidate to `dev`; require Linux workspace/E2E and every applicable
   Windows job, including setup and Bridge smoke for `textSourceRoot`.
4. Download and checksum the exact artifacts into `installers-ci-0.12.5/` and `dist/`.

No tag, draft release or published release is created.

## Recorded evidence

Pending verification.
