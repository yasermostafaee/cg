# Tasks — Deliver + retain template HTML (B-038 Phase 2)

## 1. Channel (`@cg/shared-ipc`)

- [ ] Extend the `TemplatesImportChannel` request to also carry `html` (a
      zod-validated string) beside the existing `template`; response unchanged.
      Update the channel doc comment to note the HTML payload + Runtime-only.

## 2. Browser produce + deliver (`apps/runtime`)

- [ ] Add `renderer/features/library/templateDelivery.ts`: a `vcgImageAssetSource`
      over the `.vcg` `manifest.assetIndex` + unpacked `files` map;
      `produceTemplateDelivery(bytes)` (verify → unpack → `produce(scene)` with
      `fontsCss: ''`; throws a clear message on verify/unpack/export failure);
      `importTemplateFromBytes(bridge, bytes)` (produce + send the template + html).
- [ ] `LibraryPanel` calls `importTemplateFromBytes(window.cg, bytes)`; maps a
      thrown message to the error UI; surfaces export warnings in the status line.
- [ ] `createRuntimeBridge` offline path: comment that the mock **accepts and
      ignores** `html` (no serve offline) — no functional change.

## 3. Bridge retain (`tools/caspar-bridge`)

- [ ] Add `src/template-registry.ts` — `TemplateRegistry` holding `{ info, html }`
      per id: `import(info, html)`, `get(id)`, `list()`, `html(id)`, `has(id)`;
      re-import replaces. Export it from `src/index.ts`.
- [ ] `CasparRuntime` uses the registry: `templateImport(info, html)` retains both,
      `templateGet`/`templateList` return info, add `templateHtml(id)`.
- [ ] `bridge.ts` route passes the html through to `templateImport`; set a generous
      `ws` `maxPayload` on the `WebSocketServer` with a comment.

## 4. Tests

- [ ] `@cg/shared-ipc`: a `templates.import` schema test — accepts a template + html,
      rejects a missing html, rejects a missing template.
- [ ] `apps/runtime`: `produceTemplateDelivery` produces self-contained HTML
      (runtime inlined, an image inlined as a `data:` URI, no external refs) from a
      real `pack()`-built `.vcg`; `importTemplateFromBytes` delivers the template +
      html to a fake bridge; an invalid `.vcg` throws and delivers nothing.
- [ ] `tools/caspar-bridge`: `template-registry` retains HTML by id + replaces on
      re-import + `html(unknown)` is null; a `bridge.test` WS round-trip imports a
      template + html and asserts `handle.runtime.templateHtml(id)` returns it, and
      a re-import replaces it.

## 5. Deferred-fonts debt (durable, not forgotten)

- [ ] Record the `fontsCss: ''` deferral as a **REQUIRED Phase 3 item** in this
      change's `proposal.md` / `design.md` / spec delta (done) AND in the
      `fix-live-template-render` Phase 3 scope (`tasks.md` §3): Phase 3 must inline
      the bundled Persian faces (Vazirmatn / Exo 2) BEFORE on-hardware Persian
      validation — bundle the woff2 + `fonts.css` into `apps/runtime` + pass a real
      `fontsCss`, OR serve `/fonts/` from the bridge. Until then a Vazirmatn/Exo 2
      template renders with a fallback face on air.

## 6. Gate

- [ ] Full green gate UNCACHED (`turbo … --force`) for `@cg/shared-ipc`,
      `@cg/runtime`, `@cg/caspar-bridge`: `format:check` + `typecheck` + `lint` +
      `test` + `build`. Keep the Runtime import E2E green.
- [ ] `pnpm openspec validate deliver-template-html --strict`.
- [ ] Conventional commit + push + open a PR. B-038 stays `[~]`. Do NOT archive.

## Scope guard (Phase 2)

NO HTTP server · NO `CG ADD` / command-builder change · NO `amcp-mock` change · NO
field-value change (fields stay as-is; real fields land in Phase 3). Pure
content-delivery + retention — after this phase the bridge HOLDS the HTML but
nothing renders yet.
