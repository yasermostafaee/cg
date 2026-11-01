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

Exact final CI runs and artifact checksums remain pending.
