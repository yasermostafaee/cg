# Deliver rendered template HTML to the bridge (B-038 Phase 2)

## Why

B-038's design (`fix-live-template-render`) settled how a `.vcg` actually reaches
CasparCG output. Its first gap is **no content at the bridge**: `templates.import`
carries only `TemplateInfo` (id + type + field schema), and the unpacked `.vcg`
scene/bytes are discarded in the browser. Until the bridge actually _holds_ the
rendered page, there is nothing to serve and nothing to `CG ADD` — so a LIVE take
renders nothing.

This change implements **Phase 2 — content delivery only**: the browser produces
the self-contained standalone HTML at import time (the D-019 single-file export,
now reusable via `@cg/single-file-export` from Phase 1 / PR #235) and ships it to
the bridge, which **retains** it keyed by template id alongside the `TemplateInfo`
it already stores. After this phase the bridge **holds** the HTML but nothing
renders yet — serving over HTTP (Phase 3) and `CG ADD`-by-URL + real fields
(Phase 3) and the hardened `amcp-mock` integration (Phase 4) follow.

This is additive: the WebSocket envelope and `WebSocketRuntime` are unchanged; the
import payload gains one field.

## What Changes

- **Channel.** `TemplatesImportChannel` (a Runtime-only channel; the Designer does
  not consume it) gains a required `html: string` alongside the existing
  `template: TemplateInfo`. Validation stays at the channel boundary (zod).
- **Browser produces the HTML.** `apps/runtime`'s `LibraryPanel` already verifies +
  unpacks the uploaded `.vcg`. It now also builds an asset-bytes source over the
  `.vcg`'s unpacked `files` map and calls `@cg/single-file-export`'s `produce(scene)`
  to render the standalone page (operator `asset-*` fonts and images inlined as
  base64), then sends `{ template, html }` over `templates.import`. A package that
  fails verification/unpack/export shows a clear error and registers nothing
  (R-001's "bad input → clear error, nothing registered" invariant holds).
- **Bridge retains the HTML.** `tools/caspar-bridge`'s in-memory template registry
  now stores the HTML keyed by template id beside the `TemplateInfo`. Re-importing
  the same id replaces the stored HTML. The registry exposes the HTML by id so
  Phase 3 can serve it over HTTP and Phase 4 can resolve the `CG ADD` URL to it.
  **No serving yet.**
- **Size.** The self-contained HTML (inlined runtime + scene + images) is larger
  than a `TemplateInfo`; it crosses the WS once per import (not a hot path). The
  bridge sets a generous `ws` `maxPayload`; gzip is left as a later tuning, not a
  contract change (design §4).

### Deferred to Phase 3 (logged debt, not a silent gap)

`apps/runtime` ships **no bundled app fonts** (Vazirmatn / Exo 2) and serves no
`/fonts/…`, so this phase passes `fontsCss: ''` to the exporter — the produced HTML
stays **truly self-contained** (no broken `/fonts/…` refs), but the bundled Persian
faces are **not** inlined. Until Phase 3 wires bundled-font inlining (bundle the
woff2 + `fonts.css` into `apps/runtime` and pass a real `fontsCss`, or have the
bridge serve `/fonts/` for the exporter to fetch), a template relying on
Vazirmatn / Exo 2 will render with a **fallback face** on air. This is recorded as
a REQUIRED Phase 3 item here (tasks + spec delta) and in the `fix-live-template-render`
Phase 3 scope so the on-hardware Persian validation in Phase 3 happens only after
font inlining is in place.

## Capabilities

- `runtime-caspar-bridge` (ADDED requirements): imported templates are delivered to
  the bridge as self-contained HTML over the extended `templates.import` channel,
  and the bridge **retains** that HTML keyed by template id (replacing on
  re-import) so a later phase can serve it. (The `.vcg`-import side belongs to
  `runtime-template-library`, which is not yet a living spec — R-001's change is
  unarchived — so the import-delivers-HTML behavior is captured here under the
  bridge capability, matching the `fix-live-template-render` design's choice; it
  can move when that spec lands.)

## Impact

- `@cg/shared-ipc` — `TemplatesImportChannel` request gains `html`.
- `apps/runtime` — `LibraryPanel` + a `templateDelivery` helper (produce + send);
  the offline `MockRuntime` path accepts and ignores `html` (no serve offline).
- `tools/caspar-bridge` — a `TemplateRegistry` holding `{ info, html }`;
  `CasparRuntime` retains/exposes the HTML; `createBridge` sets `maxPayload`.
- Tests: a shared-ipc channel-schema test; an `apps/runtime` test that import
  produces HTML and delivers it; a bridge test that `templates.import` retains the
  HTML keyed by id and replaces on re-import.
- Scope guard (Phase 2): **no** HTTP server, **no** `CG ADD` / command-builder
  change, **no** `amcp-mock` change, **no** field-value change. B-038 stays `[~]`.
