# Tasks — Brand Pack Factory v1

Lane: **FULL** — the output is a playout artifact even though the factory is an internal tool.

## 0. Record and boundaries

- [x] 0.1 Recover the 1 August contract and confirm the Phase-0 hand-built pack exists outside Git
- [x] 0.2 Re-file the stale PRD redirect and create/strict-validate this OpenSpec before code
- [x] 0.3 Prove customer inputs and delivery outputs are refused inside the product repository
      (`paths.test.ts`, `build.test.ts`); canonical paths follow symlinks before the boundary check

## 1. Shared export seams

- [x] 1.1 Move pure composition-for-export projection to `@cg/vcg-format`; Designer keeps its
      off-frame optimisation after the shared projection
- [x] 1.2 Move `.vcg` index-page construction to `@cg/single-file-export`; Designer output remains
      byte-for-byte equivalent for a fixed scene/index
- [x] 1.3 Add focused regression tests for projection identity/closure and page construction
      (`project-composition.test.ts`, `vcg-page.test.ts`; all existing Designer export tests green)

## 2. Brand Kit and recipe

- [x] 2.1 Implement strict versioned schemas with readable validation errors
- [x] 2.2 Resolve relative paths from the declaring file; enforce external customer boundaries
- [x] 2.3 Enforce vector logo evidence, browser render assets, font licence confirmation and
      documented derived colours
- [x] 2.4 Validate master composition selection, target raster and every exact binding

## 3. Deterministic build

- [x] 3.1 Apply declared colour/asset/font replacements and re-parse through `SceneSchema`
- [x] 3.2 Derive stable brand/template and brand/role identities; namespace unmapped master assets
      by brand/template too; package only referenced assets
- [x] 3.3 Apply page-list metadata and use the canonical runtime, page builder and `.vcg` packer
- [x] 3.4 Verify and unpack every result; prove same-input/fixed-time equality and cross-brand
      isolation

## 4. Delivery and QC

- [x] 4.1 Add CLI `validate` and `build` commands with safe output staging/atomic promotion
- [x] 4.2 Serve actual unpacked packages to Chromium; exercise play/stop and capture intro/hold/out
- [x] 4.3 Fail on browser/resource/runtime errors and distinguish `--no-preview` as incomplete
- [x] 4.4 Emit `.vcg` files, PNG phases, `contact-sheet.html`, `pack-sheet.md`, and
      `pack-report.json`
- [x] 4.5 Document the operator workflow and provide synthetic example configs with no customer data

## 5. Verification and closure

- [x] 5.1 Tool/package/shared tests green, including a synthetic end-to-end pack build: 14 unit /
      integration tests plus one Chromium delivery test; vcg-format 169, single-file-export 58,
      focused Designer export 45
- [x] 5.2 Visually inspect the generated contact sheet at desktop (1280 px) and narrow (390 px):
      phase grid, checkerboard transparency, labels, stable id and responsive single-column flow
      are legible with no horizontal overflow (2026-10-26)
- [x] 5.3 Full local gate green: 103/103 tasks, format/control-byte checks clean and strict
      OpenSpec validation 89/89 (`gate-20261025T231623Z-22200.log`, 2026-10-26)
- [x] 5.4 Push and obtain green Linux CI including e2e: GitHub Actions run
      [40245694112](https://github.com/yasermostafaee/cg/actions/runs/40245694112) succeeded
      (2026-10-26)
- [x] 5.5 Archive the OpenSpec only after all requirements and delivery evidence are complete
