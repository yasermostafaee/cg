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

## Recorded evidence

- Candidate commit: `cc41fd6e142b007464c719eaab9486a3a8d30af3`.
- The full local gate and E2E lane passed.
- Linux PR run [40555644085](https://github.com/yasermostafaee/cg/actions/runs/40555644085) passed its docs,
  workspace and Playwright E2E jobs.
- Desktop run [40555644068](https://github.com/yasermostafaee/cg/actions/runs/40555644068) passed the installer
  build, setup-window checks, fresh/offline installation, smoke checks and every upgrade acceptance, including
  the apps-open upgrade from `0.11.6`.

| File                                    |     Bytes | SHA-256                                                            |
| --------------------------------------- | --------: | ------------------------------------------------------------------ |
| `APASAI-CG-0.12.3-install-guide-fa.pdf` |    500732 | `898641583093fa008dadcfd660b3db5107ec1c86289eeeb71a26effb11b17d8a` |
| `CG-Bridge_0.12.3_x64-setup.exe`        |  24902153 | `90b5a5480884eac5011d96e359b838c1cdee5e8663a2c5885a93748800841eb2` |
| `CG-Control_0.12.3_x64-setup.exe`       | 221550874 | `6590b19617bf2d7a6cabb366650fc207e341b920c2388c5c9057c29ce7f9ce7c` |
| `CG-Designer_0.12.3_x64-setup.exe`      | 230158068 | `fac759524e50e06a9b109d4ddc8f798c0418ea4345507ddea562aafaa571d8e1` |

The exact set and `SHA256SUMS.txt` are in `installers-ci-0.12.3/`; identical copies are in `dist/`. The
candidate remains unpublished: no tag, draft release or published release was created.
