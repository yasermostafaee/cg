# Tasks — release-0-11-0 (`RELEASE-0110-01` v3, `P-064`)

Part A (`B-308`) is `console-polish` §10. Lanes: §1 FULL (shared config — the version files,
`tools/release`), §2 docs, §3 FULL (CI), §4 the release.

## 0. Establish

- [x] 0.1 The base: `origin/dev` `54363e35`; `PLAYOUT-FEATURES-01` (`e4c05142`; code `d5f91ca4`, PR
      36786735218, Desktop 36786735207), `CONSOLE-POLISH-01-A` (`fb2d0380`; code `6be3c61d`, PR
      37155833136, Desktop 37155833135) and `INSTALLER-DESIGN-01` (`11ff890c`, PR 37168047476, Desktop 37168047465) on it, every job of those runs green and RUN; `playout-features` was already archived
      (`acfce121`, 2026-10-03)
- [x] 0.2 The version: nine sources in eight files, read by `tools/release/src/release-version.mjs`
- [x] 0.3 The 51 open changes sorted; group (a) archived in one commit (`23c6bf23`: 21 changes, 80
      headers checked before and after, ten PRD items to `[x]`)
- [x] 0.4–0.7 The guide, the Playout floors, the existing drafts, the known flakes (the report)

## 1. Version `0.11.0`

- [x] 1.1 `release-version.mjs --set`: one command writes all nine; unit tests (only the version moves;
      red on the unbumped tree, green after)
- [x] 1.2 `0.11.0` set; `P-031`'s floor moves to `0.11.0`, with the reason; the Playout team's document
      names `0.11.0`
- [x] 1.3 The release line pinned both ways against a real CG Bridge (`bridgeSkew.test.ts`)

## 2. The Persian guide

- [x] 2.1 `docs/release/0.11.0/install-guide.fa.md` from `0.10.0`'s, updated for the setup window,
      first-run, the check's groups, Station setup's Check, the Playout floor and the CG licence line; the
      confirm mark gone («تأیید»)
- [x] 2.2 Six pictures from the `0.11.0` build: the two Welcomes (Desktop run 37185337108), the console's
      and the Designer's (`guide-shots`, run 37185344608)
- [x] 2.3 The guide's test follows it: sections, every quoted label against its source, the pictures

## 3. The clean-Windows acceptance

- [x] 3.1 `acceptance-station.mjs` (the fake Playout on 8080, CasparCG's stand-in on 5250, its wire read
      back) and `release-acceptance.mjs` (install offline in the guide's order, drive end to end, the real
      upgrade from `0.10.0`, uninstall)
- [x] 3.2 Two Desktop jobs; the draft release waits for both
- [x] 3.3 The built installers scanned (engines opened with 7-Zip; CG Setup's strings); tokens and dev-only
      code
- [x] 3.3a The apps' own executables read too (`cg-control.exe`, `cg-designer.exe` — the first cut read
      only CG Setup's, so 3 of the engines' files were scanned), each engine's files listed in the log —
      `ea0cbb54`, Desktop https://github.com/yasermostafaee/cg/actions/runs/37194356614 (6 files read, every
      engine file listed, no finding)
- [x] 3.4 Both acceptance jobs COMPLETED green, every phase RUN (each phase's results file read: 26, 26,
      21, 8, 24, 30 and 13 checks, none failed) — `941ffefc`, Desktop
      https://github.com/yasermostafaee/cg/actions/runs/37192167147; again on the tag,
      https://github.com/yasermostafaee/cg/actions/runs/37194356468

## 4. The release

- [x] 4.1 Tag `v0.11.0` (annotated) on `941ffefc`: PR https://github.com/yasermostafaee/cg/actions/runs/37192167182
      (`ci` and `E2E (Playwright)` RAN — designer 293 passed, runtime 328 passed) and Desktop
      https://github.com/yasermostafaee/cg/actions/runs/37192167147 (every job RAN but the two that run
      only on request or on a tag); the tag's own run
      https://github.com/yasermostafaee/cg/actions/runs/37194356468 opened the draft
- [x] 4.2 The draft read back — `APASAI CG 0.11.0`, a draft pre-release, exactly five assets — each
      re-downloaded and checked against `SHA256SUMS.txt` (four `OK`), and the three installers opened and
      scanned again from the downloaded bytes (CG Setup's front end, every text file, both apps' exes: no
      finding)
- [x] 4.3 `v0.10.0` and `v0.9.1` retitled `v<x> — superseded, do not use` (as `v0.9.0` already was), kept
      as draft pre-releases, nothing deleted — read back
- [ ] 4.4 Archive, on the owner's word. The owner's check moved to `0.11.1` (`RELEASE-0111-01`,
      2026-10-04): `0.11.0` is never delivered — see `installer-design` §5
- [x] 4.5 `v0.11.0` retitled `v0.11.0 — superseded, do not use`, kept as a draft pre-release with its five
      files, nothing deleted — read back (2026-10-04, `RELEASE-0111-01` §D4)
