## Why

The Designer had only unit tests (Vitest). Integrated flows that span canvas →
inspector → preview → export were unguarded, and several recently-fixed bugs
(diamond keyframe value, colour sync, bind-once, data-key resync, per-composition +
nested field scope, nested-lifecycle cascade, per-scope preview timing) had no
end-to-end regression. There was also no DEFAULT path for future features to gain
UI coverage — it relied on memory.

This sets up a Playwright browser-E2E harness for the Designer built to SCALE: a
test mode with no native dialogs, reusable page-object fixtures, an initial suite of
the critical flows + the recent regressions, a required CI job, and a CLAUDE.md rule
that turns each OpenSpec `#### Scenario` into Playwright steps so new features
inherit coverage.

## What Changes

- **Test mode (no native dialogs):** the SAME shipped build boots in a test mode when
  `window.CG_E2E === true` (set by Playwright `addInitScript` before app JS — a real
  user can't trigger it). In test mode the platform uses `MemoryWorkspace` +
  `MemoryKv` (fresh per page load → isolated, deterministic; no OPFS/File-System-
  Access path), and the harness neutralizes the native pickers
  (`showSaveFilePicker`/`showOpenFilePicker`/`showDirectoryPicker`) so disk save /
  export fall back to a capturable `<a download>`, `<input type=file>` is driven via
  Playwright's `filechooser`, and `alert/confirm` auto-dismiss. Single-file HTML
  export is already dialog-free (`runSingleFileHtml` → `<a download>`).
- **Harness:** `apps/designer/playwright.config.ts` runs the BUILT app via
  `vite preview` (matches turbo `test:e2e` dependsOn build), Chromium, headless,
  `reuseExistingServer` locally; a `test:e2e` script; `@playwright/test` devDep.
- **Reusable fixtures (the scaling seam):** a `DesignerApp` page object with
  documented, stable helpers — `newComposition`, `addTextElement`, `setDataKey`,
  `bindFromCanvas`, `openPreviewModal`, `play`/`stop`/`pause`/`next`,
  `addKeyframeViaDiamond`, `dragShape`, `nestCompositionInstance`, `setPlayoutTiming`,
  `setPreviewField`, `exportHtml` — so tests compose instead of rewriting boilerplate.
- **Initial suite:** the critical flow (create composition → add text + data key →
  preview live-edit → play/hold/stop → export single-file HTML) PLUS the recent
  regressions.
- **CI:** a SEPARATE `e2e` job in `pr.yml` (cache + `playwright install --with-deps
chromium`, `pnpm test:e2e`), required green, kept out of the fast unit gate.
- **Default for future features (CLAUDE.md):** an "E2E coverage" rule — any change
  adding user-facing behavior MUST add an E2E test mapping its OpenSpec scenarios to
  Playwright steps, using the fixtures.
- **Tiny app touch-ups for testability:** a `data-testid` on the canvas surface
  (the only ambiguous drag/click target) and `aria-label`s on the preview field
  inputs (also an a11y improvement). Everything else targets existing roles/labels.

## Capabilities

### Added Capabilities

- `designer-e2e-testing`: a scalable Playwright E2E harness — test-mode boot with no
  native dialogs, reusable fixtures, the critical-flow + regression suite, a required
  CI job, and the scenarios→E2E rule that makes future features inherit coverage.

## Impact

- **Designer (app):** `platform/workspace.ts` (`isE2E()` → `MemoryWorkspace`/
  `MemoryKv`), `features/canvas/CanvasOverlay.tsx` (`data-testid` on the surface),
  `features/fields/PreviewFieldForm.tsx` (`aria-label` on inputs).
- **Harness:** `apps/designer/playwright.config.ts`, `apps/designer/package.json`
  (`@playwright/test` devDep + `test:e2e`), `apps/designer/tests/e2e/**` (fixtures +
  specs), `.gitignore` (`playwright-report/`, `test-results/`).
- **CI:** `.github/workflows/pr.yml` — new `e2e` job.
- **Docs:** `CLAUDE.md` — the E2E-coverage rule; `docs/prd/platform.md` — P-005.
- **No schema/runtime change.** Unit gate unchanged; E2E is additive.
