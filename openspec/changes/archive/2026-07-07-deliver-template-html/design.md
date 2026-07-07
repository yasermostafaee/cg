# Design — Deliver + retain template HTML (B-038 Phase 2)

> Implements piece 2 of the `fix-live-template-render` design ("Deliver HTML"),
> plus the bridge-side **retention** half of piece 3 (store, not serve). Serving
> over HTTP, `CG ADD`-by-URL, real fields (Phase 3) and the hardened `amcp-mock`
> integration (Phase 4) are out of scope here.

## 1. Channel shape

`TemplatesImportChannel` request goes from `{ template: TemplateInfo }` to
`{ template: TemplateInfo, html: string }`; the response is unchanged
(`{ registered, templateId }`). `html` is **required** — it is the rendered
self-contained page. Validation stays at the channel boundary (zod), so the bridge
rejects a malformed import frame exactly as it does today. The contract types on
both bridges flow automatically: `RuntimeBridge.templates.import` and
`WebSocketRuntime`/the bridge route are all typed off `ChannelRequest<typeof
TemplatesImportChannel>`, so extending the schema updates every consumer's type.

## 2. Producing the HTML — browser side

The heavy scene→HTML work stays in the **browser** (the bridge stays thin). At
import `LibraryPanel` already runs `verify` + `unpack`; it keeps the unpacked
`files` map (previously discarded) and:

1. Builds an `ImageAssetSource` over the `.vcg` — `manifest.assetIndex` maps each
   `assetId → { path, … }` and the unpacked `files` map holds the bytes at that
   path. This is the design's "asset-bytes source (the `files` map) rather than an
   AssetStore" generalisation; `@cg/single-file-export` (Phase 1) already accepts
   any `ImageAssetSource`.
2. Constructs `new ExporterSingleFile({ cgJsIife, cgCss, fontsCss: '', assets })`
   and calls `produce(scene)` → `{ html, issues }`.
3. Sends `{ template, html }` over `templates.import`.

This lives in a small, React-free helper (`templateDelivery.ts`) so it is unit
testable: `produceTemplateDelivery(bytes)` (verify → unpack → produce, throwing a
clear message on any failure) and `importTemplateFromBytes(bridge, bytes)`
(produce + deliver). `LibraryPanel` becomes a thin caller that maps a thrown
message to the error UI and surfaces export warnings in the status line.

**Verification-failure coherence (R-001).** A package that fails `verify`, can't be
`unpack`ed, or whose export yields an error-severity issue → the helper throws,
`templates.import` is never called, nothing is registered. Non-blocking export
warnings (e.g. an image whose bytes didn't resolve) are surfaced but do not block
delivery — the HTML is still produced.

### Fonts deferred to Phase 3 (`fontsCss: ''`)

The exporter inlines bundled app faces only from the `fontsCss` it is given (the
Designer passes its `fonts.css` and serves `/fonts/*.woff2`). `apps/runtime` ships
no bundled faces and serves no `/fonts/`, so passing a real `fontsCss` would leave
unresolved `url('/fonts/…')` references and **break** the self-containment
guarantee. So Phase 2 passes `fontsCss: ''`: operator `asset-*` fonts and images
(carried in the `.vcg`) still inline; the bundled Vazirmatn / Exo 2 faces do not.

This is a **REQUIRED Phase 3 item**, not a silent gap: Phase 3 (bridge serve +
on-hardware Persian validation) must inline the bundled faces first — bundle the
woff2 + `fonts.css` into `apps/runtime` and pass a real `fontsCss`, OR have the
bridge serve `/fonts/` so the exporter can fetch+inline. Recorded in `tasks.md`,
the spec delta, and the `fix-live-template-render` Phase 3 scope. Until then a
Vazirmatn/Exo 2 template renders with a fallback face on air.

## 3. Retaining the HTML — bridge side

A small `TemplateRegistry` holds one entry per id: `{ info: TemplateInfo, html:
string }`. `CasparRuntime` swaps its bare `Map<string, TemplateInfo>` for the
registry; `templateGet`/`templateList` return the `info`, `templateImport(info,
html)` stores both, and a new `templateHtml(id)` returns the stored HTML (or
`null`). Re-import replaces the entry. This is the seam Phase 3 serves from
(`GET /template/<id>` → `templateHtml(id)`) and Phase 4 resolves the `CG ADD` URL
against — designed now, used later. The store is in-memory and resets on restart
(re-delivery on reconnect is Phase 3, per the parent design §5).

The bridge route passes the new field through: `b.templateImport(r.template,
r.html)`. The offline `MockRuntime` path keeps passing only `r.template` — it
**accepts and ignores** `html` (no HTTP server, no CasparCG offline), keeping the
mock coherent.

## 4. Size over the WS

The self-contained HTML (inlined runtime + scene + base64 images) can be hundreds
of KB to a couple of MB. It crosses the WS **once per import** (not a hot path).
The bridge sets an explicit, generous `ws` `maxPayload` so a large import frame is
never silently dropped. The browser `WebSocket` send side is unbounded. Gzip
(browser `CompressionStream` / bridge `zlib`) is left as a later tuning — it would
be a contract change and is not warranted yet (design §4, §12).

## 5. What this phase deliberately does NOT do

No HTTP server; no `CG ADD` / `command-builder` change; no `amcp-mock` change; no
field-value change (fields stay `{}` on load this phase — real fields land with the
serve/`CG ADD` wiring in Phase 3). Pure content-delivery + retention.
