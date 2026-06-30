# Tasks — Serve template HTML + render on CasparCG (B-038 Phase 3)

## Part 1 — bundled fonts (REQUIRED FIRST; gates the rest)

- [ ] Copy the 11 woff2 into `apps/runtime/public/fonts/**` and `fonts.css` into
      `apps/runtime/src/renderer/fonts.css` (same faces the Designer ships).
- [ ] `produceTemplateDelivery` / `importTemplateFromBytes` accept a `fontsCss` +
      `fetchUrl` options object; pass them through to the exporter.
- [ ] `LibraryPanel` imports `fonts.css?inline` and passes it as `fontsCss` (default
      `fetchUrl` = browser `fetch`, resolving `/fonts/…` from the SPA).
- [ ] Test: with the real `fontsCss` + a node-fs `fetchUrl`, the produced HTML
      inlines the bundled `@font-face` faces as base64 and has **no external refs**.

## Part 2 — bridge HTTP serve

- [ ] Add `tools/caspar-bridge/src/template-http-server.ts` — `TemplateHttpServer`
      over `getHtml(id)`: `GET /template/<id>` → `200 text/html; charset=utf-8`,
      `404` unknown; `start(opts)`, `stop()`, `urlFor(id)`, `guessLanHost()`.
- [ ] `CasparRuntime` owns it: derive serve opts from `connection.servers.A.host`
      (loopback local; opt-in routable + guessed/configured serve-host remote);
      `startServing()` + stop in `stop()`; expose the serve address.
- [ ] `createBridge` passes serve overrides (`bindHost`/`port`/`serveHost`), awaits
      `startServing()`, logs the chosen URL; control WS stays `127.0.0.1`.
- [ ] Tests: serve returns stored HTML for a known id, `404` unknown, replace on
      re-import.

## Part 3 — CG ADD the real URL + real fields

- [ ] `CasparRuntime.load` builds the `CG ADD` template arg as the served
      `/template/<id>` URL when serving, else the bare id; fields pass through.
- [ ] `LibraryPanel.loadOntoStack` seeds `fields` from field-schema defaults
      (`defaultFieldValue`) instead of `{}`; operator edits still flow via update.
- [ ] Test: load builds the right `CG ADD` URL + the real (non-empty) field JSON.

## Part 4 — amcp-mock regression (so this bug can't hide again)

- [ ] `tools/amcp-mock` `handleCg` `ADD`: resolve the template arg (URL → HTTP
      `GET`; `202` only on a served page, else `404 CG ADD FAILED`; bare id →
      `404`); record + expose the `CG ADD`/`CG UPDATE` data payload on the handle.
- [ ] Update the mock unit test for the new semantics (bare ref `404`; served URL
      `202`).
- [ ] New integration test: bridge (with HTTP server) + hardened mock — load/take/
      update a real served URL; assert `CG ADD` resolved (`202`) with non-empty
      fields, `CG UPDATE` carried real data; bare-id/unreachable → `404`.

## Test-infra

- [ ] Pin the Runtime import E2E fixture's `__CG_BRIDGE_URL__` to a dead port so a
      real bridge on `127.0.0.1:5280` can't make the spec go live and flake.

## Gate

- [ ] Full green gate UNCACHED (`turbo … --force`) for the touched workspaces
      (`apps/runtime`, `tools/caspar-bridge`, `tools/amcp-mock`, `@cg/shared-ipc`):
      `format:check` + `typecheck` + `lint` + `test` + `build`.
- [ ] Full `pnpm test:e2e` (Designer must stay green; the import spec now pinned).
- [ ] `pnpm openspec validate serve-template-and-render --strict`.
- [ ] Commit + push + open a PR. **B-038 stays `[~]`.**

## DO NOT close B-038

After merge the operator runs the Runtime LIVE against real CasparCG 2.3.2 and
visually confirms a real `.vcg` renders with correct Persian (right font, intact
shaping) via take, and updates via `CG UPDATE`. Only after that report does B-038
flip to `[x]`. Do NOT flip it here; do NOT archive.
