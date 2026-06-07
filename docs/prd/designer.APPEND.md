# Append these two items to the END of `docs/prd/designer.md`
# (do NOT renumber existing IDs; D-017 is the current last item).

## [ ] D-018 — Dynamic text fields (data binding + live preview) ⟨priority: high⟩

**What:** A text element becomes a runtime data field when it's given a **Data
key** in the inspector. Setting the key auto-creates/updates a scene-level
`field` (id = key) and a text `binding` to that element, so `fields[]`+`bindings[]`
stay the single source of truth. Add a "Dynamic / Data" inspector section
(key, title, description, required, type text|number, multiline, min/max length,
pattern, default) and a **preview field form** that edits values live. Also make
the runtime correct for the CasparCG flow: `update()` may arrive before `play()`,
and the legacy XML payload must parse.
**Why:** The editor can render scenes but text can't be driven by data at
playout, and the operator can't try values in the preview. This is the core of a
broadcast CG template.
**Acceptance:**

- WHEN the operator sets a non-empty Data key on a text element THEN a scene
  field (id = key) and a text binding to that element are created and the field
  appears in the Fields list
- WHEN the operator sets a Data key that duplicates an existing field key THEN
  the inspector warns and does not create a conflicting field
- WHEN the operator clears a text element's Data key THEN its backing field and
  binding are removed and the element renders its static text
- WHEN the operator edits a dynamic field's value in the preview form THEN the
  previewed text updates live using the same runtime as on-air
- WHEN `update(data)` is called before `play()` THEN the values are retained and
  applied on play, so order does not matter
- WHEN a payload arrives as CasparCG legacy XML
  (`<templateData><componentData id="KEY"><data id="text" value="V"/></componentData>…`)
  THEN it is parsed to `{KEY:"V"}` and applied; a JSON string or an
  already-parsed object is also accepted; unknown keys are ignored
- WHEN a field has `maxLength` and a longer value arrives THEN the text is
  truncated to `maxLength` and the element's existing auto-size / auto-squeeze
  applies
  **Notes:** Convenience layer over the existing `@cg/shared-schema`
  `fields[]`+`bindings[]` and `@cg/template-runtime` `applyFieldValues` — do NOT
  add a parallel field-on-element model. Inspector "Key" row already = element
  name; call the new concept **Data key**. Runtime fix in
  `packages/template-runtime/src/runtime.ts` (`play()` merge) and
  `adapters/caspar-globals.ts` (XML parse). Preview plumbing already exists
  (`apps/designer/src/platform/preview.ts`, `bridge.preview.update`).
  Change: `openspec/changes/add-dynamic-text-fields/`.

## [ ] D-019 — Single-file CasparCG HTML export (+ embedded GDD) ⟨priority: high⟩

**What:** A "Download HTML" action that exports the current composition as **one
self-contained, `file://`-safe `.html`** to drop into CasparCG's `templates/`:
all CSS/JS inlined, images as base64, fonts as base64 `@font-face`, a classic
(IIFE) build of the shared `@cg/template-runtime`, transparent stage at the
composition resolution, and an embedded **GDD** JSON-schema generated from the
dynamic fields. Reuses the same runtime source as the preview and the `.vcg`.
**Why:** The current `.vcg` `index.html` uses ES-module `import` + `fetch`, which
does not run when loaded as a `file://` template; there is no output you can drop
straight into CasparCG, and no GDD for standard CG clients.
**Acceptance:**

- WHEN the operator clicks "Download HTML" THEN one `.html` downloads with all
  CSS, JS, images (base64) and fonts (base64) inlined and no external references
- WHEN that file is opened directly in Chrome THEN there are no console errors,
  and calling `window.update({…})` then `window.play()` updates and animates (in
  either order)
- WHEN the file is loaded as a CasparCG template and `CG ADD … "{data}" 1` /
  `CG PLAY` / `CG UPDATE` / `CG STOP` are issued THEN the graphic plays, shows the
  ADD data, updates on UPDATE, and exits on STOP (`CG NEXT` is a safe no-op for a
  single-step template)
- WHEN the composition has dynamic fields THEN the exported file embeds a
  `<script name="graphics-data-definition" type="application/json+gdd">` block
  whose JSON-schema lists every dynamic field with the correct `type`/`gddType`
  and `minLength`/`maxLength`/`pattern`/`default`, with required fields in the
  top-level `required` array
- WHEN the same composition is previewed and exported THEN preview behavior
  equals exported-file behavior (shared runtime source)
  **Notes:** Depends on D-018 (dynamic fields + the `play()` fix). Add the IIFE
  runtime build alongside today's ESM bundle (same source, different format);
  feed it via `apps/designer/src/platform/cg-runtime.js`. Keep the GDD generator
  behind a small interface so an OGraf exporter can be added later (do NOT build
  OGraf now). Keep CSS within common CasparCG CEF builds (63 = 2.2, 71 = 2.3.x,
  117 = 2.4.x). Leaves the existing `.vcg` exporter unchanged.
  Change: `openspec/changes/add-caspar-single-file-export/`.
