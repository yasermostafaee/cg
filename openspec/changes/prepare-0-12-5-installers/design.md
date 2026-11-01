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

- Strict OpenSpec validation passed for both `configure-installed-text-source-root` and this change.
- The targeted Windows Bridge smoke passed at commit `db6c2ef9`, including a text-source path with
  spaces, silent install/upgrade preservation, the Setup folder field, and equality between Setup
  and silent configuration:
  <https://github.com/yasermostafaee/cg/actions/runs/41301328492/job/124835354304>.
- Fresh Windows/browser guide captures passed for the same commit:
  <https://github.com/yasermostafaee/cg/actions/runs/41302632084/job/124836768883>.
- The rebuilt six-page Persian guide and all 81 release/guide tests pass locally.
- The exact local candidate passed `pnpm gate` and the complete `pnpm gate:e2e` lane: all 26 E2E
  tasks succeeded, including 347 Designer tests, 2 Pack Factory tests and 378 CG Control tests.
- Exact candidate commit `41b81b08b9c080a96aa0d3fc3f2a81a7f121e3dd` passed the complete Linux
  workspace and Playwright jobs:
  <https://github.com/yasermostafaee/cg/actions/runs/41309221854>.
- The exact candidate's Desktop run passed all installer, Setup, Bridge smoke, clean-install and
  upgrade jobs, including the installed `0.11.6` upgrade with the apps open:
  <https://github.com/yasermostafaee/cg/actions/runs/41307026083>.
- The unpublished handoff bytes are:
  - `CG-Bridge_0.12.5_x64-setup.exe` — 24,925,765 bytes —
    `93711f9897f69065be530bd8afe2e8174848464704ed0c7e6a0a1e7cd00438c6`
  - `CG-Control_0.12.5_x64-setup.exe` — 221,718,181 bytes —
    `3286e3a16ddff2a4c773bd92f1ed1c8a5932313710a3ec909f1b20cf50cc9f40`
  - `CG-Designer_0.12.5_x64-setup.exe` — 230,322,931 bytes —
    `6ed9788b8fdb8259c56bf0604663ec06f558d4d24e12b73eb58f5afce743eead`
  - `APASAI-CG-0.12.5-install-guide-fa.pdf` — 524,108 bytes —
    `abefd0e9d7308a9c62fb99c31c391ca523be458aff4c2e3c276529969aa5edc5`

The matching files and `SHA256SUMS.txt` are retained in `installers-ci-0.12.5/` and `dist/`. No tag,
draft release or published release was created.
