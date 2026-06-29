# Import a `.vcg` template into the Runtime library (R-001)

## Why

The Runtime sidebar still says "drop a `.vcg` into the watched folder" — an
Electron-era flow. Browsers have no watched folder, so there is no way to add a
template today: the operator is stuck with whatever the demo harness seeds. The
operator needs to upload a `.vcg` package and register it as an available
template they can load onto the stack.

## What Changes

- **IPC (`@cg/shared-ipc`)** — the `templates` channels are get/list only. Add a
  `templates.import` channel: request carries the already-verified `TemplateInfo`
  (templateId, templateType, field schema); response reports `{ registered,
templateId }`. Verification happens in the browser before the call (the channel
  registers a trusted, parsed template into the in-memory registry).
- **Bridge (`apps/runtime/src/shared/runtime-bridge.ts`)** — expose
  `templates.import(req)` on `RuntimeBridge`.
- **Mock backend (`apps/runtime/src/platform`)** — `MockRuntime.templateImport`
  adds the template to the `#templates` map (the same registry seeded by
  `seedTemplates()`), so `templates.list` / `templates.get` immediately see it
  and the Inspector can surface its fields. Wired through `createRuntimeBridge`.
- **Renderer (`apps/runtime/src/renderer/features/library/`)** — a new Library
  feature replaces the placeholder sidebar copy: an "Import `.vcg`" affordance
  that, on file pick, runs `@cg/vcg-format.verify` on the bytes in the browser
  (the format is isomorphic — no Node imports in the renderer), then `unpack`s to
  derive the field schema, calls `templates.import`, and lists the registered
  templates with a "Load" action that puts one onto the stack. A failed
  verification shows a clear error and registers nothing.
- **`App.tsx`** — replace the watched-folder placeholder with the Library panel.

## Capabilities

- `runtime-template-library` (ADDED): upload + verify + register a `.vcg`, load a
  registered template onto the stack with its field schema in the Inspector, and
  reject an unverifiable package without registering it.

## Impact

- `@cg/shared-ipc` (new `templates.import` channel), `@cg/runtime` (bridge,
  `MockRuntime`, `createRuntimeBridge`, new `features/library/`, `App.tsx`).
- No schema change; `TemplateInfo` is reused as-is. No new Node dependencies in
  the renderer (`@cg/vcg-format` is isomorphic).
- Persistence is in-memory only (the registry resets on reload), matching the
  current mock. Cross-reload, storage-backed persistence is a deliberate
  follow-up — see `design.md`.
- Tests: `MockRuntime.templateImport` unit; a Playwright E2E covering a valid
  upload (appears in the library, loads onto the stack, fields in the Inspector)
  and an invalid upload (clear error, nothing registered). This stands up the
  Runtime's first Playwright harness.
