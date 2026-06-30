# Serve template HTML over HTTP + render on CasparCG (B-038 Phase 3)

## Why

B-038 Phase 1 made the single-file export reusable; Phase 2 had the browser
produce the self-contained HTML and the bridge **retain** it keyed by id
(`TemplateRegistry` / `CasparRuntime.templateHtml(id)`) — but **nothing renders
yet**: `CG ADD` still references the bare template UUID (→ CasparCG `404 CG ADD
FAILED`) and sends an empty `"{}"` payload, and the retained HTML is never served.

This change is **the phase where a `.vcg` actually renders on real CasparCG for the
first time**. It closes the three live gaps from the design (`fix-live-template-render`):
the bridge **serves** each retained template over HTTP, `CG ADD` references that
**resolvable URL** with the item's **real field values**, and the regression that
hid B-038 is closed by making `tools/amcp-mock` **resolve** the template argument
instead of blind-acking it.

It also pays the Phase-2 logged debt: the produced HTML now inlines the **bundled
Persian fonts** (Vazirmatn / Exo 2) so on-air text renders with the right face and
intact shaping — the whole point of the Persian/RTL requirement.

B-038 stays `[~]` until the LIVE path is **hardware-validated on real CasparCG
2.3.2** (operator confirms a real template renders with correct Persian via take,
and updates via `CG UPDATE`).

## What Changes

Four parts, in order (part 1 gates the rest):

1. **Bundled fonts (the Phase-2 debt).** Bundle Vazirmatn / Exo 2 (11 woff2 +
   `fonts.css`) into `apps/runtime`; import the CSS via `?inline` and pass a **real
   `fontsCss`** to `produce()` at import (replacing Phase-2's `fontsCss: ''`). The
   bundled `@font-face` faces inline as base64 so the HTML stays **fully
   self-contained** — CasparCG fetches no external font. The bridge does **not**
   serve `/fonts/`.
2. **Bridge HTTP serve.** The bridge runs a small HTTP server (mirroring
   `tools/caspar-amcp-probe`'s static serve) exposing each retained template at a
   stable URL `http://<serve-host>:<port>/template/<id>` (`200 text/html; charset=utf-8`),
   `404` for an unknown id, served from the Phase-2 `TemplateRegistry`. Re-import
   replaces; remove unregisters. The **control WebSocket stays `127.0.0.1`**; the
   template server defaults to loopback when CasparCG is local and an **opt-in
   routable serve-host** when CasparCG is remote (the same serve-host concern the
   probe had).
3. **`CG ADD` the real URL + real fields.** `CG ADD` references the `/template/<id>`
   URL (not the bare UUID), and the load path carries the item's **real field
   values** (schema defaults at minimum; operator-entered Inspector values when
   present) instead of `"{}"`. The hardware-verified `CG UPDATE` verb already works
   once a real page is loaded, so update flows from the same path.
4. **`amcp-mock` regression hardening.** `tools/amcp-mock` stops blind-acking
   `CG ADD`: it **resolves** the template argument (an HTTP `GET` for a URL — `202`
   only when it maps to a served page; `404 CG ADD FAILED` for an unresolvable /
   non-URL reference) and **exposes the data payload** for assertion. New
   integration tests exercise a **real served URL + non-empty fields** end-to-end
   (`CG ADD` resolves → `CG UPDATE` carries real data) — the exact gap that hid
   B-038.

Plus a small test-infra fix: pin the Runtime import E2E fixture's
`__CG_BRIDGE_URL__` to a dead port so a real bridge listening on `127.0.0.1:5280`
can't make the spec go live and flake.

## Capabilities

- `runtime-caspar-bridge`:
  - ADDED — the bridge serves retained template HTML over HTTP at a stable URL;
    the template HTTP server is reachable by CasparCG (loopback when local, opt-in
    routable when remote) while the control WS stays loopback; template resolution
    is validated (mock 404s an unresolvable reference), not blind-acked.
  - MODIFIED — "Commands reach a reachable CasparCG server": `CG ADD` references the
    served template URL and carries the item's real field values (not a bare id +
    `"{}"`).
  - (The import/produce side, incl. bundled-font inlining, belongs to the
    `runtime-template-library` capability, which is not yet a living spec — captured
    here under the bridge capability for now, matching the Phase-2 choice.)

## Impact

- `apps/runtime` — bundle fonts (`public/fonts/**` + `src/renderer/fonts.css`),
  pass real `fontsCss` to `produce()`, seed real field defaults on load.
- `tools/caspar-bridge` — `TemplateHttpServer` (serve from the registry),
  host/reachability selection, `CasparRuntime` builds the `CG ADD` URL + serves;
  control WS stays loopback.
- `tools/amcp-mock` — resolve the `CG ADD` template arg + expose the data payload;
  updated unit test for the new semantics.
- Tests — Part 1 no-external-refs with real fonts inlined; Part 2 HTTP serve
  (known/unknown/replace); Part 3 `CG ADD` URL + real field JSON; Part 4 mock
  resolution + real end-to-end integration; import E2E pinned.
- B-038 stays `[~]` (flips to `[x]` only after on-hardware Persian validation).
