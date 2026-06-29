# Design — Fix LIVE template render (B-038)

> **Design only.** No implementation. This settles how a `.vcg` actually reaches
> CasparCG output. The C-001 Phase-3b harness already proved the target model
> end-to-end on real CasparCG 2.3.2 (`match=YES`, `persian=YES`).

## 1. The three gaps (from the B-038 read-only report)

1. **No content at the bridge** — `templates.import` carries only `TemplateInfo`
   (id + type + field schema); the `.vcg` scene/bytes are unpacked in the browser
   and discarded ([LibraryPanel.tsx:121-134](../../../apps/runtime/src/renderer/features/library/LibraryPanel.tsx)).
2. **No Node-callable scene→HTML path** — the working single-file export
   (`apps/designer/src/platform/ExporterSingleFile.ts` + the IIFE `cg-runtime`
   bundle) is Designer app-layer code; `apps/runtime` can't import it (cross-app
   lint boundary) and neither can the Node bridge.
3. **Bridge serves nothing + sends `{}`** — `CG ADD "<uuid>" 1 "{}"` → 404, then
   `CG UPDATE` 403 ([caspar-runtime.ts:221](../../../tools/caspar-bridge/src/caspar-runtime.ts),
   [LibraryPanel.tsx:155](../../../apps/runtime/src/renderer/features/library/LibraryPanel.tsx)).

## 2. Decision — four pieces, bridge stays thin

| Piece        | Where                    | What                                                           |
| ------------ | ------------------------ | -------------------------------------------------------------- |
| Produce HTML | **Browser** (Runtime)    | Reuse the D-019 self-contained single-file export at import    |
| Deliver HTML | `@cg/shared-ipc` channel | Extend `templates.import` to carry the rendered HTML           |
| Serve HTML   | **Bridge** (thin HTTP)   | `GET /template/<id>` → the stored HTML; `CG ADD "<that URL>"`  |
| Real fields  | Browser load path        | Seed `FieldValues` from field-schema defaults + operator edits |

The heavy scene→HTML work stays in the **browser**; the bridge only stores and
serves a string and swaps the `CG ADD` argument from a bare id to a URL. The
hardware-verified `CG UPDATE` already works once a real page is loaded.

## 3. Producing the HTML — and the self-containment guarantee

The single-file export is **truly self-contained** — confirmed in
`ExporterSingleFile`:

- **Fonts inlined.** `#inlineFonts` rewrites every `/fonts/...` URL (Vazirmatn for
  Persian shaping, Exo 2) to a base64 `@font-face` `data:` URI; operator fonts
  (`asset-*`) are embedded the same way. **No Google Fonts, no network.**
- **Images inlined.** `#inlineImages` resolves each image element's bytes and emits
  `assetUrls[assetId] = data:<mime>;base64,...`; the runtime's `applyAssetUrls`
  wires `<img data-cg-asset-id>` → the data URI. **No external image fetch.**
- **Runtime + scene inlined.** the IIFE `window.CG` bundle, the scene JSON literal,
  the GDD + playout metadata — all baked in; CSP is permissive for `file://`.

**Consequence (the make-or-break):** the bridge serves **one HTML string per
template** and CasparCG fetches **nothing else** — no per-asset endpoints. This is
what keeps the bridge thin.

### Where the exporter runs — a shared **browser** package (not the bridge)

`apps/runtime` cannot import `apps/designer`, so the export path must be lifted
into a shared, browser-importable package — proposed **`@cg/single-file-export`** —
containing `ExporterSingleFile` + `image-export` + the generated IIFE bundle
(`bundle-runtime.mjs` retargeted to output there). `ExporterSingleFile` already
imports only `@cg/shared-schema` / `@cg/shared-ipc` / `@cg/vcg-format` — it is
already decoupled, so this is a move, not a rewrite. Designer keeps working by
importing the new package.

> **On "don't extract unless lighter":** extraction here is **browser-side** and is
> precisely what keeps the **bridge** thin — the bridge never renders, never holds
> a DOM, never bundles the runtime; it serves a string. The rejected alternatives
> are heavier:
>
> - _Render in the Node bridge_ — needs the IIFE bundle + a DOM/JSDOM in Node and
>   asset resolution server-side. Heavy, and duplicates the proven browser path.
> - _Duplicate the exporter into `apps/runtime`_ — divergence risk; "what the
>   Designer shows IS what CasparCG plays" (the D-019 invariant) breaks.
>
> So: **browser produces the HTML via a shared export lib; the bridge stays a thin
> store-and-serve.**

**Asset source nuance.** In the Designer the exporter resolves image bytes from the
project AssetStore; in the Runtime the bytes live in the `.vcg`'s unpacked `files`
map. The shared exporter must accept an **asset-bytes source** (the `files` map)
rather than assuming an AssetStore — a small constructor/parameter generalization
to design with the extraction.

## 4. Delivering the HTML — the channel

Extend `TemplatesImportChannel`:

```ts
// request: { template: TemplateInfo, html: string }   // html = the self-contained page
// response: { registered: boolean, templateId: Id }
```

- Keyed by `template.templateId`; the bridge stores `{ TemplateInfo, html }` and
  serves the html at `/template/<templateId>`.
- **Size.** With inlined woff2 + images the HTML can be ~0.5–2 MB. It crosses the WS
  **once per import** (not a hot path). Note for implementation: set the bridge
  `ws` `maxPayload` generously, and consider gzipping the `html` field (the browser
  has `CompressionStream`; the bridge `zlib`) if sizes warrant — design leaves this
  as an implementation tuning, not a contract change.
- **Backward/offline:** `html` is required on the live path; the offline `MockRuntime`
  accepts and ignores it (see §8). Validation stays at the channel boundary.

## 5. Serving the HTML — the bridge HTTP server

The bridge gains a **small HTTP server** (mirroring `tools/caspar-amcp-probe`'s
`ProbeServer`): `GET /template/<id>` → `200 text/html; charset=utf-8` with the
stored html; unknown id → `404`. This is **separate from the control WebSocket**.

**Lifecycle:**

- **import** → store/replace `html` for `<id>`; immediately serveable.
- **re-import same id** → replaces the html (next `CG ADD` loads the new page).
- **load/take/out/remove** → no change to the served page (the template stays
  registered for the library's lifetime; there is no template-delete channel today).
- **bridge restart** → the in-memory store is empty. The Runtime must **retain the
  produced html per template** and **re-deliver on (re)connect** so live loads keep
  working after a bridge bounce. (Today the browser discards the `.vcg` after
  import; this change has it keep the produced html — it already has it in hand.)
  This rides the existing reconnect→resync path; design it as "on connect, push all
  registered templates' html."

## 6. Host & reachability — localhost vs remote CasparCG (called out explicitly)

The control **WebSocket stays bound to `127.0.0.1`** (unchanged; the security
invariant). The **template HTTP server's bind + the URL host in `CG ADD`** depend
on where CasparCG runs — the bridge derives this from the connection config
(`servers.A.host`), with an override:

- **CasparCG on the same box** (`host` is `127.0.0.1`/`localhost`) → serve on
  `127.0.0.1`; `CG ADD "http://127.0.0.1:<port>/template/<id>"`. **No LAN exposure;
  stays fully loopback.** This is the common operator case.
- **CasparCG remote** (`host` is a LAN IP) → CasparCG cannot reach the bridge's
  loopback, so the HTTP server must bind a routable interface (`0.0.0.0`, **opt-in**)
  and the `CG ADD` URL host must be **the bridge machine's address as CasparCG sees
  it**. Pick it from an explicit `serveHost` config; default to a guessed LAN IPv4
  (exactly the harness's `guessLanHost()` from `os.networkInterfaces()`), and log it
  loudly so a wrong guess is obvious.
- **Security note.** The HTTP server serves only **template HTML** (no control
  surface — control stays on the loopback WS). LAN binding is opt-in and only when
  CasparCG is remote; acceptable for an operator tool on a trusted broadcast LAN,
  and called out in the config + logs.

So the rule: **serve host = loopback when CasparCG is loopback, else the
configured/guessed routable host**; the bind follows suit.

## 7. Real fields — no more `{}`

- **At load**, seed `FieldValues` from the template's **field-schema defaults**
  (`DynamicField.default` exists for text/multiline/color/boolean/number/select/list;
  image is `defaultAssetId?`). `loadOntoStack` changes `fields: {}` →
  `fields: defaultsFor(template.fields)`.
- **Operator edits** from the Inspector already flow as the item's `fields` via
  `stack.update`; those values seed subsequent `CG UPDATE` (and a re-load).
- The bridge keeps passing the item's `fields` to `CG ADD`/`CG UPDATE` (now
  non-empty). The command-builder seam is unchanged — `caspar-runtime` simply passes
  the **served URL** as the template arg and the **real fields** as the data arg.

## 8. Offline / mock coherence

`MockRuntime` (offline) has no HTTP server and no CasparCG. The extended
`templates.import` is accepted with the `html` **ignored**; load/take continue to
simulate stack state as today. The indicator stays **"OFFLINE (mock) — not
connected to CasparCG"**, which already means "nothing renders on air" — so no
incoherence. The only requirement: the channel change must not break the mock
(html optional-to-ignore on that path).

## 9. Regression — `tools/amcp-mock` must stop blind-acking

Today `handleCg`'s `CG ADD` returns `202` regardless of the template arg and never
inspects the data. New behavior so this class of bug can't hide:

- **Resolve the template argument.** For a URL ref, the mock performs an HTTP `GET`
  of the URL — `200` → `202` and mark the layer producer `html`; non-200 / a bare
  non-URL id → **`404 CG ADD FAILED`** (matching real CasparCG's failure). This
  actually proves the bridge served a reachable page.
- **Expose the data payload.** Record the `CG ADD` / `CG UPDATE` data argument on
  the mock handle so tests can assert it is the **real, non-empty** field JSON
  (and Persian survives), not `{}`.
- **Tests use a real reference + real fields.** The new integration test boots the
  bridge (with its HTTP server) + amcp-mock, imports a template (browser-produced
  html delivered + served), loads/takes, and asserts: `CG ADD` used a **served URL**
  the mock could `GET` (→ `202`), the data arg was **non-empty** field values, and
  `CG UPDATE` carried updated fields. Empty-payload / bare-id cases assert `404`.

## 10. Open questions — resolved

- **How browser-produced HTML reaches & is keyed in the bridge:** extended
  `templates.import` carries `html`; the bridge stores it by `templateId` and serves
  `/template/<id>` (§4–5).
- **Bridge HTTP host/port + reachability:** loopback when CasparCG is loopback, else
  a configured/guessed routable `serveHost` with opt-in `0.0.0.0` bind; control WS
  stays loopback (§6).
- **Per-template assets:** none to serve — the single-file export inlines fonts and
  images as base64 data URIs; CasparCG fetches nothing extra (§3, confirmed in
  `ExporterSingleFile`).
- **Offline/mock interaction:** mock ignores `html`, stays "OFFLINE (mock)";
  coherent — offline already means "no render" (§8).

## 11. Phased implementation plan (for `tasks.md`; not built here)

1. **Extract** `@cg/single-file-export` (move `ExporterSingleFile` + `image-export`
   - the IIFE bundle output; generalize the asset source to a bytes map). Designer
     re-points to it; no behavior change (the D-019 invariant holds).
2. **Channel + browser import**: extend `TemplatesImportChannel` with `html`;
   `LibraryPanel` produces the html (from the unpacked `.vcg` via the shared export)
   and sends it; retain html per template for reconnect re-delivery; seed real field
   defaults on load.
3. **Bridge serve + URL**: HTTP server (`/template/<id>`), host/bind selection,
   `caspar-runtime` builds the `CG ADD` URL + passes real fields; re-deliver on
   connect.
4. **amcp-mock resolution + payload exposure** and the **real-reference integration
   tests**; keep the bridge's loopback WS invariant intact.

Each phase is its own change, integration-tested against the hardened amcp-mock,
with the LIVE path validated on real CasparCG before B-038 closes.

## 12. Risks

- **HTML size over the WS** (inlined fonts/images): one-time per import; mitigate
  with `maxPayload` + optional gzip (§4).
- **Remote-CasparCG reachability / wrong serve-host guess:** explicit config +
  loud logging; default to loopback when CasparCG is local (§6).
- **Bridge-restart template loss:** addressed by retain-and-re-deliver on connect
  (§5); if deferred, document that a re-import is needed after a bridge bounce.
- **Extraction churn:** mechanical (the exporter is already decoupled); the main
  care is the asset-source generalization and the bundle output path.
