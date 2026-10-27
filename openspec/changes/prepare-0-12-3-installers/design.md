# Design — 0.12.3 installer candidate

## One matching set

The nine version sources remain authoritative. Installer filenames, Installed apps, application version
surfaces and CG Bridge health all derive from `0.12.3`; packaging refuses drift.

The fixed-file feature crosses Designer authoring, CG Control operation and CG Bridge file access. Therefore
all three installers are delivered together, including for a station already on `0.12.2`.

## Evidence sequence

1. Set the shared version and guide to `0.12.3`.
2. Run the full local gate and E2E lane.
3. Push one installer-marked candidate to `dev`; require Linux workspace/E2E and every applicable Windows job.
4. Download and checksum the exact artifacts from that commit into `installers-ci-0.12.3/` and `dist/`.

No tag, draft release or published release is created.
