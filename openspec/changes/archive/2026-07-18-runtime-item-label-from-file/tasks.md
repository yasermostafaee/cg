# Tasks — the operator-facing label is the imported file name (R-004)

## 1. Carry the file name

- [x] 1.1 `TemplateInfoSchema` gains optional `sourceFileName` (`packages/shared-ipc/src/channels/templates.ts`) — additive, back-compatible, display-only.
- [x] 1.2 `ProduceOptions.sourceFileName` threaded through `produceTemplateDelivery` / `importTemplateFromBytes` (`templateDelivery.ts`); recorded on the `TemplateInfo`.
- [x] 1.3 `LibraryPanel.importFile` passes `file.name` (it already read it for the error path and dropped it on success).
- [x] 1.4 No bridge change needed — `templates.import` already carries the whole `TemplateInfo`, and both registries (bridge `TemplateRegistry`, `MockRuntime`) store it as-is.

## 2. One label rule

- [x] 2.1 `cleanFileName()` — strip `.vcg` (case-insensitive, end-anchored only), `-`/`_` → spaces, collapse runs, trim. Case PRESERVED (Persian / mixed script).
- [x] 2.2 `templateDisplayName()` — file name → manifest name → "Unnamed template". Never the id.

## 3. All three panels

- [x] 3.1 Library card: label primary; the `· <uuid>` secondary text REMOVED; id kept as the row tooltip.
- [x] 3.2 `useTemplateIndex` — the registry join the stack needs (`StackItemState` carries no label, and must not).
- [x] 3.3 `StackRow`: label primary (bold), content `title` field on the secondary line, id as tooltip only. The `fields['title'] ?? item.itemId` fallback is gone.
- [x] 3.4 `Inspector` header: label primary (it already held the `TemplateInfo` and dropped its name); id as tooltip only.

## 4. Tests

- [x] 4.1 `templateName.test.ts` — the cleaning rules (extension, separators, case preservation on Persian/mixed, collapse, unusable input) and the label priority. Supersedes the two "falls back to the id" cases.
- [x] 4.2 `itemLabel.dom.test.ts` — all three panels: imported → cleaned file name; seeded starter → manifest name; no UUID anywhere; id reachable as tooltip; content title still distinguishes two rows of one template.
- [x] 4.3 `libraryPanel.dom.test.ts` — the superseded id-as-secondary-text and id-fallback assertions replaced.
- [x] 4.4 E2E: `import-vcg-template.spec.ts` asserts `valid.vcg` → "valid" (not the scene's `e2e-lower-third`) and that the row does not print its id; the `selectStackRow` page object addresses a row by its id TOOLTIP now that the row no longer prints the id.

## 5. Gate

- [x] 5.1 `pnpm --filter @cg/runtime typecheck lint test build` + `@cg/shared-ipc`
- [ ] 5.2 `pnpm turbo run typecheck lint test build --force` + `pnpm format:check`
- [ ] 5.3 `pnpm test:e2e`
- [ ] 5.4 `pnpm openspec validate runtime-item-label-from-file --strict`
