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

## Recorded evidence

- Candidate commit: `5d1e367b31816bb2a03dcc32b4b372d7f19dca36`.
- The full local gate and complete local E2E lane passed.
- Linux PR run [41294591200](https://github.com/yasermostafaee/cg/actions/runs/41294591200) passed its docs,
  workspace and Playwright E2E jobs.
- Desktop run [41294591199](https://github.com/yasermostafaee/cg/actions/runs/41294591199) passed the installer
  build, both setup-window checks, fresh/offline installation, Bridge smoke, installed-app smoke with the Designer
  text-source ACL probe, and every upgrade acceptance, including the apps-open upgrade from `0.11.6`.

| File                                    |     Bytes | SHA-256                                                            |
| --------------------------------------- | --------: | ------------------------------------------------------------------ |
| `APASAI-CG-0.12.4-install-guide-fa.pdf` |    501213 | `b5e9b7d65fe4278ef23af04f38d811593d089ad43e15ce7cdd6ea0f18e6d9541` |
| `CG-Bridge_0.12.4_x64-setup.exe`        |  24896911 | `a6904af1595b097cdcf07aa17e6ba3dbb464caa0dd59a360288af89e44f74f78` |
| `CG-Control_0.12.4_x64-setup.exe`       | 221688037 | `3c7b858c97ca3d9eebdb488a7cc19f1212e589028ea52661da2e013a79565f71` |
| `CG-Designer_0.12.4_x64-setup.exe`      | 230293970 | `a72e8365f63824f837f955bb96d531a0b2fb772c4304b1250cb7a56d71f93c39` |

The exact set and `SHA256SUMS.txt` are in `installers-ci-0.12.4/`; copies are in `dist/`. The candidate remains
unpublished: no tag, draft release or published release was created.
