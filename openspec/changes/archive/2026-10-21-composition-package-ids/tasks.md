# Tasks — composition-package-ids (B-352; RUN-NEXT-VERSION-02 Part 1.2)

Lane: **FULL** — the package id CG Control keys its library by, the import path, a persisted project id.

## 1. The cause, read in the code

- [x] 1.1 `editSceneOf` spreads the project scene; `scopeSceneToComposition` kept its `id`; the Exporter writes it as
      `manifest.id`; CG Control keys the library by it and CG Bridge lists the new version under it — each import
      replaced the last, silently.
- [x] 1.2 Save As kept the project id (and filed the copy's handle and Recent entry under the original's). Duplicate
      composition already mints a fresh composition id. There is no Duplicate project.
- [x] 1.3 No existing PRD entry; `B-352` filed.

## 2. One id per composition; Save As is a copy

- [x] 2.1 `compositionPackageId` (`@cg/vcg-format`), set by `scopeSceneToComposition`.
- [x] 2.2 `saveDisk({ asCopy })` + `adoptProjectId` (scene and undo history); only the author's Save As copies.
- [x] 2.3 Tests: `package-id.test.ts`, `per-composition-export.test.ts`, `package-ids.test.ts`; e2e
      `save-as-copy.spec.ts` (download tier: Save, Export, re-Export, Save As, Export, the picture still resolves).

## 3. CG Control asks

- [x] 3.1 Import split (`produceTemplateDelivery` / `deliverTemplateImport`); `importVcgFile(file, channel, choose)`;
      the picker asks in its message region; the success line says Updated / Imported.
- [x] 3.2 The rebuild sends the library's id.
- [x] 3.3 Tests: `importClash.test.ts`, `fixedSlotLoad.test.ts` (one more channel-scoped read), `template-rebuild.test.ts`;
      e2e `import-clash.spec.ts`; `channel-templates.spec.ts`'s re-import answers Update.
- [x] 3.4 Linux `e2e` discharged on `4034dfea` — run
      https://github.com/yasermostafaee/cg/actions/runs/39576924935 : `E2E (Playwright)` RAN and passed
      (`import-clash.spec.ts` both cases, `channel-templates.spec.ts`; the Designer's `save-as-copy.spec.ts`
      among its 337 passed).
