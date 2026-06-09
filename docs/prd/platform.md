# Platform / infra / tooling — backlog

Cross-cutting items: shared packages, build/hosting, tests. See `README.md`.

## [ ] P-001 — Bundle Vazirmatn offline ⟨priority: medium⟩

**What:** Ship the Vazirmatn font with the apps instead of loading it from the
jsdelivr CDN, and tighten the CSP accordingly.
**Why:** Broadcast machines are often air-gapped; a CDN `<link>` breaks Persian
rendering offline and forces a loose CSP.
**Acceptance:**

- WHEN an app loads with no network THEN Persian text still renders in Vazirmatn
- WHEN the app loads THEN the CSP no longer needs `cdn.jsdelivr.net`
  **Notes:** add `@fontsource/vazirmatn`, import it in each app entry, drop the
  `<link>` in `index.html`. Touches `@cg/ui` font stack + both apps.

## [ ] P-002 — Lightweight routing / app shell ⟨priority: low⟩

**What:** Introduce simple routing so each app can have more than one screen
(e.g. editor / library / settings).
**Why:** Both apps are single-screen; settings and library will need routes.
**Acceptance:**

- WHEN the operator navigates between views THEN the URL reflects the view and
  back/forward work
  **Notes:** keep it minimal; this is the seam the zip's TanStack Router pattern
  could fill if desired.

## [ ] P-003 — Hosting / packaging recipe ⟨priority: low⟩

**What:** Decide and document how operators get the apps — static hosting vs a
small local server that also embeds the CasparCG bridge.
**Why:** No distribution story yet now that there's no installer.
**Acceptance:**

- WHEN following the doc THEN a non-developer can serve Designer and Runtime
  (and, for Runtime, start the bridge) on an operator machine
  **Notes:** a single local binary serving the SPA + the bridge is the smoothest
  no-IT option; relates to C-001.

## [ ] P-004 — Deepen platform tests ⟨priority: low⟩

**What:** Add tests for the Designer `Exporter` (pack → download) and `Preview`
behind their DI seams, and re-add integration coverage once the bridge exists.
**Why:** The migration removed Electron-era tests; export/preview paths are
under-covered.
**Acceptance:**

- WHEN the test suite runs THEN Exporter produces a valid `.vcg` for a sample
  scene and Preview builds a document for a scene
  **Notes:** `Exporter`/`Preview` already take `cgJs`/`cgCss` via constructor, so
  they're testable without the `?raw` bundle.

## [~] P-005 — Designer E2E + UI test coverage (Playwright), built to scale ⟨priority: high⟩ — change: `openspec/changes/add-designer-e2e-testing/`

**What:** A Playwright browser-E2E harness for the Designer SPA, built so FUTURE
features inherit coverage by default. Runs the SAME shipped build in a test mode
(`window.CG_E2E` → `MemoryWorkspace` + `MemoryKv`, no native dialogs), with reusable
page-object fixtures for common actions, an initial suite covering the critical
flows + recent bug regressions, a separate required CI job, and a CLAUDE.md rule
that maps each OpenSpec `#### Scenario` to Playwright steps.
**Why:** There was no E2E/UI coverage — only unit tests. Integrated flows (canvas →
inspector → preview → export) and cross-cutting regressions were unguarded, and new
features had no default path to E2E coverage.
**Acceptance:**

- WHEN `pnpm test:e2e` runs (locally or in CI) THEN the Designer boots against the
  built app in test mode with NO native file dialogs, and the suite runs headless
- WHEN a test is written THEN it composes reusable fixtures (newComposition,
  addTextElement, setDataKey, bindFromCanvas, openPreviewModal, play/stop/pause,
  addKeyframeViaDiamond, dragShape, nestCompositionInstance, setPlayoutTiming,
  exportHtml) instead of rewriting boilerplate
- WHEN the critical flow runs THEN create composition → add text with a data key →
  preview (edit field value live) → lifecycle play/hold/stop → export single-file
  HTML all pass
- WHEN the recent fixes are exercised THEN their regressions pass (diamond keyframe
  captures current value; colour edits sync display+shape; bind-once + disable;
  data-key resync on selection change; per-composition + nested namespaced field
  scope in the parent preview; nested-lifecycle cascade; per-scope preview timing)
- WHEN CI runs THEN a separate `e2e` job (Chromium cached) runs the suite and is
  required green, kept out of the fast unit gate
- WHEN a future change adds user-facing behavior THEN it MUST add an E2E test mapping
  its OpenSpec scenarios to Playwright steps (CLAUDE.md rule)
  **Notes:** test mode = `window.CG_E2E` set by Playwright `addInitScript` before app
  JS (test-only; a real user can't trigger it); built app via `vite preview`
  (matches turbo `test:e2e` dependsOn build); E2E lives in `apps/designer/tests/e2e`.
  Change: `openspec/changes/add-designer-e2e-testing/`.
