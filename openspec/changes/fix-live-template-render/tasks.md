# Tasks — Fix LIVE template render (B-038)

**This change is DESIGN ONLY.** The tasks below are the implementation breakdown
(the plan of record); they are **not** implemented here. Each phase becomes its
own follow-up change, integration-tested against the hardened `amcp-mock`, with the
LIVE path validated on real CasparCG before B-038 closes.

## 0. Design (this change)

- [x] `design.md` — three gaps; the four-piece thin-bridge model; self-containment
      guarantee (fonts/images inlined — confirmed in `ExporterSingleFile`); shared
      `@cg/single-file-export` package rationale; channel extension; bridge HTTP
      serve + lifecycle; host/reachability (localhost vs remote); real fields;
      offline/mock coherence; amcp-mock regression; risks.
- [x] `specs/runtime-caspar-bridge/spec.md` — ADDED requirements (serve+URL, real
      fields, reachable host, validated-not-blind-acked).
- [x] B-038 → `[~]`, priority high, "not on-air until fixed" note referencing this
      change. C-001 stays `[x]`.
- [x] `openspec validate fix-live-template-render --strict` + `format:check`.

## 1. Shared single-file export package (follow-up)

- [ ] Extract `@cg/single-file-export` from `apps/designer/src/platform/`
      (`ExporterSingleFile` + `image-export`); retarget `bundle-runtime.mjs` to emit
      the IIFE bundle into the package. Designer re-points to it (no behavior
      change — the D-019 "what the Designer shows IS what CasparCG plays" invariant
      holds).
- [ ] Generalize the asset source: accept the `.vcg`'s unpacked `files` bytes map
      (Runtime) as well as the AssetStore (Designer).

## 2. Channel + browser import (follow-up)

- [ ] `@cg/shared-ipc`: extend `TemplatesImportChannel` request with
      `html: string` (the self-contained page). Generous `maxPayload`; optional
      gzip if sizes warrant.
- [ ] `apps/runtime` `LibraryPanel`: on import, produce the HTML via
      `@cg/single-file-export` from the unpacked `.vcg`, send it with the
      `TemplateInfo`; retain the HTML per template for reconnect re-delivery.
- [ ] Load path: seed `FieldValues` from the template's field-schema defaults
      (replace `fields: {}`); operator edits flow via `stack.update` as today.

## 3. Bridge serve + URL + fields (follow-up)

> **Phase-2 status:** the channel + browser-produce + bridge-RETAIN half of this
> phase shipped in the `deliver-template-html` change (B-038 Phase 2): the bridge
> now HOLDS the HTML keyed by id (`CasparRuntime.templateHtml(id)` /
> `TemplateRegistry`). What remains below is the SERVE + URL + real-fields half.

- [ ] `tools/caspar-bridge`: small HTTP server (`GET /template/<id>` →
      `200 text/html`), separate from the control WS (WS stays `127.0.0.1`).
      Serve from `CasparRuntime.templateHtml(id)` (the Phase-2 retention seam).
- [ ] Host/bind selection: loopback when CasparCG is local; routable opt-in serve
      host (config or guessed LAN IPv4) when remote; log the chosen URL.
- [ ] `CasparRuntime`: build the `CG ADD` template arg as the served URL; pass real
      field values; re-deliver on connect.
- [ ] **REQUIRED — bundled Persian fonts (deferred from Phase 2).** Phase 2 ships
      the produced HTML with `fontsCss: ''` (the Runtime bundles no Vazirmatn /
      Exo 2 faces and serves no `/fonts/`), so the bundled faces are NOT inlined and
      a Vazirmatn/Exo 2 template renders with a **fallback face** on air. Before the
      on-hardware Persian validation below, inline the bundled faces: bundle the
      woff2 + `fonts.css` into `apps/runtime` and pass a real `fontsCss` to
      `produce()`, OR serve `/fonts/` from the bridge so the exporter can
      fetch+inline. Persian output is wrong until this lands.

## 4. amcp-mock regression + integration tests (follow-up)

- [ ] `tools/amcp-mock`: resolve the `CG ADD` template argument (HTTP `GET` for
      URLs → `404` on failure; bare id → `404`); expose the `CG ADD`/`CG UPDATE`
      data payload on the handle.
- [ ] Integration tests: bridge (with HTTP server) + hardened mock — assert a
      served URL the mock fetched (`202`), non-empty fields, `CG UPDATE` carries
      updates; empty/bare-id cases assert `404`.
- [ ] On-hardware validation of the full LIVE path before flipping B-038 → `[x]`.

## 5. Gate (this change — docs only)

- [x] `openspec validate fix-live-template-render --strict`.
- [x] `format:check`.
- [ ] Commit + push + open a PR for design review. Do NOT implement, do NOT
      archive.
