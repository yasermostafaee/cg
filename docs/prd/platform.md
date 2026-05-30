# Platform / infra / tooling — backlog

Cross-cutting items: shared packages, build/hosting, tests. See `README.md`.

## [ ] P-001 — Bundle Vazirmatn offline   ⟨priority: medium⟩
**What:** Ship the Vazirmatn font with the apps instead of loading it from the
jsdelivr CDN, and tighten the CSP accordingly.
**Why:** Broadcast machines are often air-gapped; a CDN `<link>` breaks Persian
rendering offline and forces a loose CSP.
**Acceptance:**
- WHEN an app loads with no network THEN Persian text still renders in Vazirmatn
- WHEN the app loads THEN the CSP no longer needs `cdn.jsdelivr.net`
**Notes:** add `@fontsource/vazirmatn`, import it in each app entry, drop the
`<link>` in `index.html`. Touches `@cg/ui` font stack + both apps.

## [ ] P-002 — Lightweight routing / app shell   ⟨priority: low⟩
**What:** Introduce simple routing so each app can have more than one screen
(e.g. editor / library / settings).
**Why:** Both apps are single-screen; settings and library will need routes.
**Acceptance:**
- WHEN the operator navigates between views THEN the URL reflects the view and
  back/forward work
**Notes:** keep it minimal; this is the seam the zip's TanStack Router pattern
could fill if desired.

## [ ] P-003 — Hosting / packaging recipe   ⟨priority: low⟩
**What:** Decide and document how operators get the apps — static hosting vs a
small local server that also embeds the CasparCG bridge.
**Why:** No distribution story yet now that there's no installer.
**Acceptance:**
- WHEN following the doc THEN a non-developer can serve Designer and Runtime
  (and, for Runtime, start the bridge) on an operator machine
**Notes:** a single local binary serving the SPA + the bridge is the smoothest
no-IT option; relates to C-001.

## [ ] P-004 — Deepen platform tests   ⟨priority: low⟩
**What:** Add tests for the Designer `Exporter` (pack → download) and `Preview`
behind their DI seams, and re-add integration coverage once the bridge exists.
**Why:** The migration removed Electron-era tests; export/preview paths are
under-covered.
**Acceptance:**
- WHEN the test suite runs THEN Exporter produces a valid `.vcg` for a sample
  scene and Preview builds a document for a scene
**Notes:** `Exporter`/`Preview` already take `cgJs`/`cgCss` via constructor, so
they're testable without the `?raw` bundle.
