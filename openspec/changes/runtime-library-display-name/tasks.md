# Tasks — the Library shows a template's display name (R-004)

## 1. Recon (done)

- [x] 1.1 Confirm the name EXISTS at every hop: `ManifestSchema.name` (required),
      `SceneSchema.name` (required), written by the Designer's exporter, returned by
      `unpack` ⇒ nothing to author, nothing to invent.
- [x] 1.2 Locate drop site A: `templateDelivery.ts` `produceTemplateDelivery` destructures
      `manifest` and builds `TemplateInfo` without reading `manifest.name`.
- [x] 1.3 Locate drop site B: `seed.ts` `seedTemplates()` maps `STARTER_TEMPLATES` without
      reading the starter's `label`.
- [x] 1.4 Confirm `TemplateInfo` is the ONLY schema in the chain with no name field.
- [x] 1.5 Confirm the bridge needs no edit: `TemplateRegistry` stores `TemplateInfo`
      opaquely, so an added field propagates for free.
- [x] 1.6 Confirm the empty-name edge is real: `ManifestSchema.name` is `z.string()` with
      no `.min(1)` ⇒ fall back on blank-after-trim, not just on `undefined`.

## 2. Schema — carry the name

- [x] 2.1 `@cg/shared-ipc` `channels/templates.ts`: add optional `name` to
      `TemplateInfoSchema` (ADDITIVE — every existing payload stays valid).
- [x] 2.2 Round-trip test: a `TemplateInfo` WITHOUT a name still parses (back-compat).

## 3. Populate both drop sites

- [x] 3.1 `templateDelivery.ts`: populate `name` from `manifest.name`, falling back to
      `scene.name`; omit the key when neither yields a non-blank string.
- [x] 3.2 `seed.ts`: populate `name` from the starter's `label`.

## 4. Render it

- [x] 4.1 `LibraryPanel.tsx`: row primary line = display name, id demoted to the secondary
      line; fall back to the id when the name is absent/blank.
- [x] 4.2 The import status line and the Load button's accessible label use the display
      name (with the same fallback).

## 5. Tests

- [x] 5.1 `templateDelivery` unit: an imported `.vcg` carries `manifest.name` onto
      `TemplateInfo`.
- [x] 5.2 `templateDelivery` unit: a blank/absent manifest name omits `name` (so the UI
      falls back).
- [x] 5.3 `seed` unit: seeded starters carry their label as `name`.
- [x] 5.4 `LibraryPanel` DOM: a named template renders its name (id still present as
      secondary); an unnamed one renders the id as primary — never an empty line.

## 6. Gate

- [x] 6.1 `typecheck` + `lint` + `test` + `build` green for `@cg/shared-ipc` and
      `apps/runtime` (uncached).
- [x] 6.2 `pnpm format:check` clean.
- [x] 6.3 `pnpm openspec validate runtime-library-display-name --strict`.
- [x] 6.4 Mark R-004 `[~]` with the change dir; flip to `[x]` on archive.
