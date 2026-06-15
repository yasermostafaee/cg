## Context

The Designer is a browser SPA whose "backend" is the in-process `window.cg` bridge.
Storage is seamed behind `Workspace` + `KeyValueStore` (`@cg/storage`), with
`MemoryWorkspace`/`MemoryKv` already used by unit tests. Real storage prefers File
System Access → OPFS → memory, and several explicit actions open native pickers.
Unit tests (Vitest) cover logic; nothing covered the integrated UI.

## Decisions

### Test mode via `window.CG_E2E`, not a separate build

Playwright sets `window.CG_E2E = true` via `addInitScript` (runs before app JS). The
app reads it through `isE2E()` and selects `MemoryWorkspace` + `MemoryKv`. Chosen over
a build-time env (`VITE_CG_E2E`) so E2E exercises the EXACT shipped build — no
test-only divergence — and over a `?e2e=1` URL so a real user can't trigger it. Effect
is deliberately narrow: storage selection only. The native-picker neutralization lives
in the HARNESS (delete `window.show*Picker`, auto-dismiss dialogs), keeping test-only
hacks out of production code; the bridge already falls back to `<a download>` when
`showSaveFilePicker` is absent.

`prefs` is a module-level const in `workspace.ts`; because `addInitScript` runs before
the module is imported, the flag is observed at evaluation time.

### Built app via `vite preview`

The Playwright `webServer` serves the built `dist` via `vite preview` on a fixed port
(matches turbo `test:e2e` `dependsOn: ['build']` and the CI build→e2e order),
`reuseExistingServer` locally for fast iteration. Prod-like, no HMR flake.

### Fixtures are the scaling seam

A single `DesignerApp` page object wraps every common action as a documented method,
preferring `getByRole`/`getByLabel` over CSS. The preview lives in a same-origin
`srcDoc` iframe, so assertions read it via `frameLocator('iframe[title="cgpreview-
modal"]')` and the runtime's `[data-cg-element-id]` nodes. Only TWO testability
touch-ups were needed: a `data-testid` on the canvas surface (the one ambiguous
drag/click target) and `aria-label`s on the preview field inputs (also a11y). New
tests compose helpers; new features add helpers here once and reuse them.

### Scenarios → E2E is the durable rule

The spec is the memory: the CLAUDE.md rule ties each OpenSpec `#### Scenario` of a
user-facing change to Playwright steps built from the fixtures. That, plus the
required CI job, is what makes coverage grow by default instead of by recollection.

### What stays in unit tests

Frame-exact lifecycle behavior (e.g. the cascade holding each child at its precise
out-point) is already covered deterministically by the `@cg/template-runtime` unit
tests via the injected clock. The E2E layer verifies the INTEGRATED UI path (controls
exist, wire through the bridge, and the preview reflects them) rather than re-asserting
frame math through a real browser clock, which would be flaky.
