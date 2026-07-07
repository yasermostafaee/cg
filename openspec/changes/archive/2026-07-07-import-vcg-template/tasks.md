# Tasks — Import a `.vcg` template (R-001)

## 1. IPC (`@cg/shared-ipc`)

- [x] Add `TemplatesImportChannel` (`templates.import`) to `channels/templates.ts`
      — request `{ template: TemplateInfo }`, response `{ registered, templateId }`.
- [x] Build `@cg/shared-ipc`.

## 2. Bridge + mock backend (`@cg/runtime`)

- [x] `runtime-bridge.ts` — add `templates.import(req)` to `RuntimeBridge`.
- [x] `MockRuntime.templateImport(template)` — set it into the `#templates` map;
      return `{ registered: true, templateId }`.
- [x] `createRuntimeBridge.ts` — wire `templates.import`.
- [x] `MockRuntime.test.ts` — import registers a template that `templateGet` /
      `templateList` then return.

## 3. Renderer Library feature (`apps/runtime/src/renderer/features/library/`)

- [x] `uuid()` helper (renderer-local, feature-detected — non-secure-context safe).
- [x] `LibraryPanel.tsx` — "Import `.vcg`" file affordance: read bytes → `verify`
      → on failure show a clear error and register nothing; on success `unpack` →
      derive `TemplateInfo` → `templates.import` → refresh the list. List each
      registered template with a "Load" action calling `stack.load`.
- [x] `App.tsx` — replace the watched-folder placeholder copy with `<LibraryPanel>`.

## 4. E2E (Playwright — Runtime's first harness)

- [x] Add `playwright.config.ts` + `tests/e2e/fixtures/runtime.ts`, the
      `test:e2e` script, and `@playwright/test` dev dep to `@cg/runtime`.
- [x] `import-vcg-template.spec.ts` — (a) upload a valid `.vcg` (generated with
      `@cg/vcg-format.pack`) → it appears in the library, loads onto the stack,
      and its field shows in the Inspector; (b) upload an invalid `.vcg` → clear
      error, nothing registered.

## 5. Gate

- [x] `format:check` + `typecheck` + `lint` + `test` + `build` for `@cg/shared-ipc` + `@cg/runtime` (turbo `--force`, uncached at least once); `pnpm test:e2e`.
- [x] `openspec validate import-vcg-template --strict`.
- [x] Conventional commit + push; R-001 PRD `[~]` noting the change dir. Do NOT
      archive (await confirmation).
