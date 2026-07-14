# The Library shows a template's display name, not its raw id (R-004)

## Why

The Runtime's Library renders `t.templateId` as each row's primary line
(`LibraryPanel.tsx`). For a Designer-authored `.vcg` that id is a **UUID** — meaningless
to an operator scanning the panel under time pressure. The import status line and the
Load button's accessible label carry the same UUID.

The human-readable name is **not missing from the data** — it exists, required, at every
hop:

- `ManifestSchema.name` (`@cg/shared-schema` `manifest.ts`) — required `z.string()`.
- `SceneSchema.name` (`scene.ts`) — required `z.string()`.
- The Designer's exporter writes it (`Exporter.ts` passes `name: scene.name`), and
  `@cg/vcg-format`'s `pack` puts it in the manifest.
- `unpack` hands the fully-parsed `Manifest` — with `.name` — straight back.

It is **dropped at exactly two places**, both of which construct a `TemplateInfo` from a
scope where the name is already in hand:

1. `templateDelivery.ts` — `produceTemplateDelivery` destructures `{ scene, manifest, files }`
   and then builds `TemplateInfo` from `manifest.id` / `scene.templateType` / the field
   aggregate, **never reading `manifest.name`**.
2. `seed.ts` — `seedTemplates()` maps `STARTER_TEMPLATES` to `TemplateInfo` and omits the
   starter's `label` (its "Display name shown on the landing page").

`TemplateInfo` (`@cg/shared-ipc` `channels/templates.ts`) is the only schema in the chain
with no name field. That is the whole bug.

## What Changes

Purely additive plumbing of a value that already exists. No new source of truth.

1. **`TemplateInfo.name`** — a new **optional** `name` on `TemplateInfoSchema`. Optional
   keeps every existing caller, test, and persisted payload valid: an older `TemplateInfo`
   without a name still parses, and the UI falls back to the id exactly as today.
2. **Populate at the import drop site** — `templateDelivery.ts` reads `manifest.name`
   (falling back to `scene.name`), both of which are already destructured two lines above.
3. **Populate at the seed drop site** — `seed.ts` reads the starter's `label`.
4. **Render it** — the Library row shows the name as its primary line with the id demoted
   to the secondary line; the import status line and the Load button's accessible label use
   the name too. When no usable name exists the row shows the id, unchanged from today.

"No usable name" is a real case worth naming: `ManifestSchema.name` is `z.string()` with
**no `.min(1)`**, so an empty-string name is schema-valid. The fallback therefore triggers
on absent **or blank-after-trim** — not on `undefined` alone.

## Non-goals / explicitly unchanged

- **No AMCP/wire change.** The name is registry metadata; it never reaches a `CG ADD` /
  `CG UPDATE` argument. ADR-0006's verb sequence and the quoter are untouched.
- **No new identity.** `templateId` remains the sole key everywhere — the registry, the
  stack's `templateId`, `urlFor(templateId)`, the served `/template/<id>` path, the
  default-position store. The name is display-only and is never matched, keyed, or routed on.
- **No bridge behavior change.** `TemplateRegistry` stores `TemplateInfo` opaquely, so the
  field propagates with no bridge edit.
- R-003 staged edits, B-067 nested fields, B-070/B-072, R-009, R-011 — all untouched.

## Capabilities

- `runtime-template-library` — ADDED: the library presents a template by its display name.

## Impact

- `@cg/shared-ipc` — `TemplateInfo.name` (additive, optional).
- `apps/runtime` — `templateDelivery.ts`, `seed.ts`, `LibraryPanel.tsx`.
- `tools/caspar-bridge`, `@cg/shared-schema`, `@cg/vcg-format` — **no change** (the name
  already exists there; the registry is shape-transparent).
- R-004 → `[x]` on archive.
