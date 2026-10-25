# Tasks — Brand Pack Factory v1

Lane: **FULL** — the output is a playout artifact even though the factory is an internal tool.

## 0. Record and boundaries

- [x] 0.1 Recover the 1 August contract and confirm the Phase-0 hand-built pack exists outside Git
- [x] 0.2 Re-file the stale PRD redirect and create/strict-validate this OpenSpec before code
- [ ] 0.3 Prove customer inputs and delivery outputs are refused inside the product repository

## 1. Shared export seams

- [ ] 1.1 Move pure composition-for-export projection to `@cg/vcg-format`; Designer keeps its
      off-frame optimisation after the shared projection
- [ ] 1.2 Move `.vcg` index-page construction to `@cg/single-file-export`; Designer output remains
      byte-for-byte equivalent for a fixed scene/index
- [ ] 1.3 Add focused regression tests for projection identity/closure and page construction

## 2. Brand Kit and recipe

- [ ] 2.1 Implement strict versioned schemas with readable validation errors
- [ ] 2.2 Resolve relative paths from the declaring file; enforce external customer boundaries
- [ ] 2.3 Enforce vector logo evidence, browser render assets, font licence confirmation and
      documented derived colours
- [ ] 2.4 Validate master composition selection, target raster and every exact binding

## 3. Deterministic build

- [ ] 3.1 Apply declared colour/asset/font replacements and re-parse through `SceneSchema`
- [ ] 3.2 Derive stable brand/template and brand/role identities; package only referenced assets
- [ ] 3.3 Apply page-list metadata and use the canonical runtime, page builder and `.vcg` packer
- [ ] 3.4 Verify and unpack every result; prove same-input/fixed-time equality and cross-brand
      isolation

## 4. Delivery and QC

- [ ] 4.1 Add CLI `validate` and `build` commands with safe output staging/atomic promotion
- [ ] 4.2 Serve actual unpacked packages to Chromium; exercise play/stop and capture intro/hold/out
- [ ] 4.3 Fail on browser/resource/runtime errors and distinguish `--no-preview` as incomplete
- [ ] 4.4 Emit `.vcg` files, PNG phases, `contact-sheet.html`, `pack-sheet.md`, and
      `pack-report.json`
- [ ] 4.5 Document the operator workflow and provide synthetic example configs with no customer data

## 5. Verification and closure

- [ ] 5.1 Tool/package/shared tests green, including a synthetic end-to-end pack build
- [ ] 5.2 Visually inspect the generated contact sheet at desktop and narrow widths
- [ ] 5.3 Full local gate green
- [ ] 5.4 Push and obtain green Linux CI including e2e
- [ ] 5.5 Archive the OpenSpec only after all requirements and delivery evidence are complete
