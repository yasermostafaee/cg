# Design — Import a `.vcg` template (R-001)

## Where verification runs

`@cg/vcg-format` is isomorphic, so `verify()` and `unpack()` run **in the
browser** on the uploaded bytes — no Node imports leak into the renderer (golden
rule 1). The renderer is therefore the verification authority: it only calls
`templates.import` once `verify().ok` is true. This keeps the import channel a
thin "register this trusted template" call rather than shipping raw archive bytes
across the bridge for the mock to re-parse.

Consequence: the channel request is the parsed `TemplateInfo`
(`{ templateId, templateType, fields }`), not the `.vcg` bytes. When the real
CasparCG bridge replaces the mock, server-side re-verification can be layered in
without changing the renderer flow (it already has verified bytes in hand).

## TemplateInfo derivation

`unpack()` returns `{ scene, manifest }`. The registered `TemplateInfo` is built
as `{ templateId: manifest.id, templateType: scene.templateType, fields:
scene.fields }` — the same shape `seedTemplates()` produces, so `templates.get`
(used by the Inspector on selection) surfaces the field schema unchanged. No
`TemplateInfo` schema change is needed.

A re-uploaded id overwrites the prior registration (`Map.set`) — acceptable for
the mock; the operator simply re-imports.

## Registry + reactivity

`MockRuntime.templateImport` extends the existing `#templates` map. The Library
panel keeps its own list state, seeded from `templates.list()` and refreshed
after a successful import — simpler than adding a `templatesChanged` emitter for
a single consumer. Loading onto the stack reuses `stack.load`; the stack's
existing `onStateChanged` stream drives the row's appearance, and selecting the
row drives the Inspector exactly as today.

## Item ids

Loading onto the stack needs a unique `itemId`. The Runtime is served over plain
HTTP on a LAN IP (non-secure context), where `crypto.randomUUID` can throw, so a
small renderer-local `uuid()` helper feature-detects and falls back to a
`Math.random`-based id (mirrors the Designer's `uuid` helper).

## Out of scope (follow-up)

Cross-reload persistence is intentionally NOT in this change: the in-memory
registry resets on reload, matching the current mock. A storage-backed registry
(persist imported templates via `@cg/storage`, restore on boot) is a separate
follow-up — file it as a new PRD item when the real bridge lands, since the
storage shape should be designed alongside the real template ingest path.
