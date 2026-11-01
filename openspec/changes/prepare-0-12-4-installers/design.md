# Design — 0.12.4 installer candidate

## One matching set

The nine version sources remain authoritative. Installer filenames, Installed apps, application version surfaces
and CG Bridge health all derive from `0.12.4`; packaging refuses drift.

`B-356` changes CG Designer's installed-shell permissions. CG Control and CG Bridge receive no functional change
from that fix, but the delivered suite keeps one matching version so operators never receive a mixed set.

## Evidence sequence

1. Set the shared version and guide to `0.12.4`.
2. Run the full local gate and E2E lane.
3. Push one installer-marked candidate to `dev`; require Linux workspace/E2E and every applicable Windows job.
4. Download and checksum the exact artifacts from that commit into `installers-ci-0.12.4/` and `dist/`.

No tag, draft release or published release is created.
