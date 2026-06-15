## 1. Test mode (no native dialogs)

- [x] 1.1 `platform/workspace.ts` — `isE2E()` (reads `window.CG_E2E`); `initWorkspace()`
      returns `MemoryWorkspace` and `prefs` uses `MemoryKv` in test mode. Documented test-only.
- [x] 1.2 Harness `addInitScript` sets `window.CG_E2E = true` and neutralizes
      `showSaveFilePicker`/`showOpenFilePicker`/`showDirectoryPicker`; auto-dismiss dialogs.

## 2. Harness

- [x] 2.1 `@playwright/test` devDep + `apps/designer/playwright.config.ts` (built app via
      `vite preview`, Chromium, headless, `reuseExistingServer` locally, trace on retry).
- [x] 2.2 `test:e2e` script in `apps/designer/package.json`; `.gitignore` report/results.

## 3. Reusable fixtures (page object)

- [x] 3.1 `tests/e2e/fixtures/designer.ts` — `DesignerApp` with documented helpers:
      `newComposition`, `addTextElement`, `setDataKey`, `bindFromCanvas`,
      `openPreviewModal`, `play`/`stop`/`pause`/`next`, `addKeyframeViaDiamond`,
      `dragShape`, `nestCompositionInstance`, `setPlayoutTiming`, `setPreviewField`,
      `setPreviewTiming`, `exportHtml`, preview-iframe readers.
- [x] 3.2 Tiny testability touch-ups: `data-testid` on the canvas surface;
      `aria-label` on preview field inputs.

## 4. Initial suite

- [x] 4.1 `critical-flow.spec.ts` — composition → text + data key → preview live-edit
      → play/hold/stop → export single-file HTML.
- [x] 4.2 `regressions.spec.ts` — diamond keyframe captures current value; colour
      edits sync display+shape; bind-once + disable when bound; data-key resync on
      selection change; per-composition + nested namespaced field scope in parent
      preview; nested-lifecycle cascade; per-scope preview timing.

## 5. CI

- [x] 5.1 `.github/workflows/pr.yml` — separate `e2e` job: cache Playwright browsers,
      `playwright install --with-deps chromium`, `pnpm test:e2e`. Required, separate
      from the fast unit gate.

## 6. Make it the default (docs)

- [x] 6.1 `CLAUDE.md` — "E2E coverage" rule (scenarios → Playwright steps via fixtures) + the "how to add an E2E test" pattern.

## 7. Gate

- [x] 7.1 Full unit gate green (typecheck + lint + test + build) + the new E2E suite green.
- [x] 7.2 `pnpm openspec validate add-designer-e2e-testing --strict`.
