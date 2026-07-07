# Design — Serve template HTML + render on CasparCG (B-038 Phase 3)

> Implements pieces "Serve HTML", "Real fields", and the "validated-not-blind-acked"
> regression from `fix-live-template-render`, plus the Phase-2 bundled-font debt.
> This is the first phase where a `.vcg` renders on real CasparCG.

## Part 1 — bundled fonts (gates the rest)

The single-file exporter inlines bundled `@font-face` faces only from the
`fontsCss` it is given (the Designer passes its `fonts.css` and serves
`/fonts/*.woff2`, which the exporter fetches and rewrites to base64). Phase 2
passed `fontsCss: ''`, so Vazirmatn / Exo 2 were not inlined and on-air Persian
would fall back.

Fix: bundle the same 11 woff2 + `fonts.css` into `apps/runtime` (`public/fonts/**`

- `src/renderer/fonts.css`) exactly as the Designer has them, import the CSS via
  `?inline` in `LibraryPanel`, and pass it as `fontsCss` to the produce path. At
  import the exporter fetches `/fonts/*.woff2` (served by the Runtime SPA) and inlines
  them as base64 — so the produced HTML stays **fully self-contained**; CasparCG
  fetches no external font. The bridge does NOT serve `/fonts/` (fonts ride inside
  the HTML; the bridge stays thin).

`templateDelivery.ts` stays React-free and Vite-free: `produceTemplateDelivery`
accepts `{ fontsCss?, fetchUrl? }`. `LibraryPanel` (the React/Vite layer) does the
`?inline` import and passes `fontsCss`; the default `fetchUrl` is the browser
`fetch` (resolves `/fonts/…` against the SPA). Tests inject a node-fs `fetchUrl`
that reads the bundled woff2, so they can prove the faces inline as base64 with no
external refs.

## Part 2 — bridge HTTP serve

A `TemplateHttpServer` (mirrors `caspar-amcp-probe`'s `ProbeServer`) wraps a
`node:http` server: `GET /template/<id>` → `200 text/html; charset=utf-8` with
`getHtml(id)`, else `404`. It is constructed over the registry's `html(id)` lookup,
so it always serves the current retained HTML (re-import replaces; remove
unregisters — both are registry mutations, no server change).

**Ownership.** `CasparRuntime` owns the server: it already holds the registry (the
HTML source) and builds the `CG ADD` command (needs the URL), and its `start()` /
`stop()` lifecycle is the natural home. Keeping it in `CasparRuntime` (not only
`createBridge`) means the existing bridge integration tests — which drive
`CasparRuntime` directly — exercise the full serve → `CG ADD` → mock-GET path. The
control WebSocket in `bridge.ts` is untouched and stays `127.0.0.1`.

**Host & reachability (design §6).** Derived from `connection.servers.A.host`:

- CasparCG **local** (host is loopback) → bind `127.0.0.1`, serve-host `127.0.0.1`.
  No LAN exposure. The common operator case.
- CasparCG **remote** (host is a LAN IP) → bind a routable interface (`0.0.0.0`,
  **opt-in**) and serve-host = an explicit config value, else a guessed LAN IPv4
  (`os.networkInterfaces()`, exactly the harness's `guessLanHost()`), logged loudly.

The port is ephemeral (`0`) by default: the `CG ADD` URL carries the actual bound
port, so CasparCG always gets a correct, reachable URL with no fixed-port
coordination. `createBridge` exposes serve overrides (`bindHost` / `port` /
`serveHost`) and logs the chosen URL.

## Part 3 — CG ADD the real URL + real fields

- **Browser.** `LibraryPanel.loadOntoStack` seeds `fields` from the template's
  field-schema defaults (`defaultFieldValue` from `@cg/shared-schema`) instead of
  `{}`. Operator Inspector edits already flow as the item's `fields` via
  `stack.update`.
- **Bridge.** `CasparRuntime.load` builds the `CG ADD` template argument as the
  served URL (`TemplateHttpServer.urlFor(id)`) when serving is active, else falls
  back to the bare id (keeps non-serving unit tests working). The fields pass
  through unchanged — now non-empty. The `CommandBuilder` seam is unchanged: it
  still receives `(slot, template, fields)`; only the `template` value changes from
  a bare id to a URL.

`CG UPDATE` is unchanged and already hardware-verified — once a real page is loaded
it carries the merged field set the Reconciler holds.

## Part 4 — amcp-mock: validated, not blind-acked

`handleCg` `ADD` becomes async and resolves the template argument:

- URL (`http(s)://…`) → HTTP `GET` (short timeout). `200` → `202` + set the layer
  producer `html`; non-`200` / unreachable → `404 CG ADD FAILED`.
- bare non-URL id → `404 CG ADD FAILED` (the exact B-038 failure).

The mock also records the `CG ADD` / `CG UPDATE` data payload per slot, exposed on
the handle (`lastCgAdd(slot)` / `lastCgUpdate(slot)`), so a test asserts the data
is the real, non-empty field JSON (and Persian survives), not `"{}"`.

This changes the mock's default `CG ADD` semantics, so the few existing CG-ADD
drivers are updated: the mock's own unit test (bare ref → `404`, served URL →
`202`), and the two bridge integration tests (register a template + start serving
so the load resolves). `transport.test.ts` overrides the `CG` handler and is
unaffected; no other consumer drives the default `CG ADD` handler.

A new integration test boots the bridge (with its HTTP server) + the hardened mock,
imports a template, loads/takes/updates, and asserts: `CG ADD` used a served URL
the mock fetched (`202`), the data arg was non-empty field values, and `CG UPDATE`
carried the updated fields. Bare-id / unreachable cases assert `404`.

## Out of scope / deferred

- On-hardware Persian validation flips B-038 → `[x]` (operator-run, after merge).
- Bridge-restart re-delivery of retained HTML on reconnect remains a later
  follow-up (the design's §5 retain-and-re-deliver) — the browser still holds the
  produced HTML; a re-import re-registers after a bounce.
