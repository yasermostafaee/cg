# Tasks — shared font library (D-126)

## 1. Contract and persistence

- [x] 1.1 Add typed shared-font import/list/remove channels and Designer bridge methods.
- [x] 1.2 Add a project-independent `SharedFontStore` under `shared/fonts` with sha256 dedupe.
- [x] 1.3 Cover persistence, dedupe, bytes and removal with store tests.

## 2. Unified Shared Library UI

- [x] 2.1 Replace the image-only add button with an Image/Font add menu and validate each selection.
- [x] 2.2 List/search/remove both kinds with an honest font preview and kind label.
- [x] 2.3 Register shared `FontFace`s without clearing them on project switch.
- [x] 2.4 Expose shared fonts in every project's font picker and add their scene references on selection.

## 3. Preview and export

- [x] 3.1 Merge shared-font URLs into Canvas and Preview iframe asset maps.
- [x] 3.2 Extend `.vcg` preflight and font packaging to project-or-shared resolution.
- [x] 3.3 Extend single-file HTML font inlining to project-or-shared resolution.
- [x] 3.4 Cover both export formats and missing-font warnings with focused tests.

## 4. Verification

- [x] 4.1 Run focused Designer/store/export tests, typecheck and lint.
- [x] 4.2 Run Designer E2E for import, project switch, selection, Preview and export.
- [ ] 4.3 Run the full repository gate and inspect the real e2e step before commit/push.
