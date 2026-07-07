# Fix LIVE template render — content delivery + serve + real fields (B-038)

## Why

C-001's transport / failover / AMCP-update-verb capability is real and
hardware-verified (it stays `[x]`), but **the Runtime is not actually
on-air-capable**: with the Runtime LIVE against real CasparCG 2.3.2, take/update
render **nothing** (B-038). Three gaps cause it:

1. **The bridge has no template content** — only `TemplateInfo` (id + type + field
   schema) crosses the `templates.import` channel; the `.vcg` scene/bytes are
   unpacked in the browser and **discarded**.
2. **No Node-callable scene→HTML path** — the working single-file export (D-019
   `ExporterSingleFile` + the IIFE `cg-runtime` bundle) lives in the **Designer
   app**, not in a package the bridge (or even the Runtime app) can reuse.
3. **The bridge serves nothing and sends `{}`** — `CG ADD` gets a bare UUID
   (→ 404) with an empty payload, so even a found template would render no data.

The C-001 Phase-3b harness already proved the target model works end-to-end on
real CasparCG 2.3.2: serve an HTML page over HTTP, `CG ADD "<url>"`, then
`CG UPDATE` with the field JSON → `match=YES`, `persian=YES`.

This change is **design-only** — a thorough `design.md`; no implementation.

## What Changes (designed here, built later)

- **Content to the bridge.** At import the browser produces the **self-contained
  standalone HTML** (the D-019 single-file export it already has the inputs for)
  and ships it to the bridge. `TemplatesImportChannel` is extended to carry the
  rendered HTML (+ minimal metadata), not just `TemplateInfo`. The heavy
  scene→HTML work stays in the **browser**; the bridge stays thin.
- **Bridge serves HTML over HTTP.** The bridge runs a small HTTP server (mirroring
  `tools/caspar-amcp-probe`) and serves each registered template at a stable URL
  (e.g. `http://<bridge-host>:<port>/template/<id>`), then issues
  `CG ADD "<that URL>"`. The serve host must be reachable **by CasparCG** —
  localhost vs remote-CasparCG is handled explicitly.
- **Real fields.** The load path carries the item's actual field values (schema
  defaults at minimum, operator values ideally) instead of `{}`, so `CG ADD` and
  the hardware-verified `CG UPDATE` carry real data.
- **Lifecycle.** Where a served template is registered/unregistered (import /
  remove / re-import), how the URL maps to content, replacement semantics.
- **Regression hardening for `tools/amcp-mock`.** The mock stops blind-acking: it
  resolves the `CG ADD` template argument (404 on an unresolvable/non-page ref)
  and exposes the data payload, so "looks acked, renders nothing" can't hide
  again. New integration tests use a **real template reference + non-empty
  fields**.

## Capabilities

- `runtime-caspar-bridge` (ADDED requirements): imported templates are delivered
  to the bridge as self-contained HTML and **served over HTTP**; `CG ADD`
  references that **resolvable URL** with **real field values**; the HTTP serve
  host is reachable by CasparCG (loopback vs remote); and template resolution is
  **validated, not blind-acked** in the mock (regression). (The `.vcg`-import
  side belongs to `runtime-template-library`, which is not yet a living spec —
  R-001's change is unarchived — so the import-delivers-HTML behavior is captured
  here under the bridge capability for now; it can move when that spec lands.)

## Impact

- Design doc only now. Implementation (later) touches: `@cg/shared-ipc` (channel),
  the single-file export path (made Runtime-callable — likely a shared browser
  package, NOT the Node bridge), `apps/runtime` (import + load fields),
  `tools/caspar-bridge` (HTTP serve + CG ADD URL), `tools/amcp-mock` (resolution +
  payload), tests.
- B-038 → `[~]`, priority high, "not on-air until fixed". C-001 stays `[x]`.
- Gate (docs-only): `openspec validate fix-live-template-render --strict` +
  `format:check`. Do NOT implement or archive.
