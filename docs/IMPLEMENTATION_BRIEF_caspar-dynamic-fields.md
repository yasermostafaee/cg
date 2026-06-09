# Implementation brief — dynamic text fields + live preview + CasparCG single‑file export

> **Reconciled** version of the original task spec, corrected against the actual
> code in this repo (`cg/`). Hand this to Claude Code. It is written in English
> on purpose: the codebase, identifiers, and comments are English, and the
> original spec was too.
>
> **Read this whole file before writing any code.** The single most important
> correction: **the three features are NOT greenfield.** Most of the runtime,
> the preview harness, and a working dynamic‑field model already exist. The job
> is to _reuse and extend_ them, add three genuinely new pieces, and fix two
> concrete bugs — not to build a parallel system.

---

## 0. TL;DR of what changed vs. the original spec

| Original spec assumed                                                    | Reality in this repo                                                                                                                                                                                                                                                                                                                                      | What to do                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dynamic fields don't exist; add `key/title/…` **onto the text element**. | A **scene‑level** model already exists: `Scene.fields: DynamicField[]` + `Scene.bindings: FieldBinding[]`, applied by `@cg/template-runtime`. It's more powerful and is used by the starter templates.                                                                                                                                                    | **Do NOT** add a parallel field‑on‑element system. Keep `fields[]`+`bindings[]` as the single source of truth. Add an element‑centric **convenience layer** (see §2) so the _UX_ of "type a key to make it dynamic" works, while the data still lives in `fields[]`+`bindings[]`. |
| Implement `play/stop/next/update/remove` globals + a runtime.            | Already implemented: `installCasparGlobals` (`packages/template-runtime/src/adapters/caspar-globals.ts`) + `createRuntime` (`runtime.ts`).                                                                                                                                                                                                                | Reuse. Only **fix `play()`** (§3 bug #1), **implement the XML fallback** (currently a stub), and decide `next()`/steps (§3).                                                                                                                                                      |
| Build a live preview.                                                    | Already exists: `apps/designer/src/platform/preview.ts` runs the same runtime in an iframe and already understands a `postMessage` `update` action. Bridge method `preview.update()` exists.                                                                                                                                                              | Reuse the harness. The **only missing piece is the data‑entry form UI** + wiring `Reset`/`Next` (§5).                                                                                                                                                                             |
| Export = the only target; produce one `.html`.                           | A `.vcg` exporter already exists (`apps/designer/src/platform/Exporter.ts`) and already emits a CasparCG‑shaped `index.html` + `cg.js` + `cg.css`. **But that `index.html` uses ES‑module `import` + `fetch('./template.json')`, which does NOT work when loaded as a `file://` template** (Chromium blocks module scripts + local fetch over `file://`). | Keep `.vcg` as‑is (it's for the project's own Runtime over http). **Add a NEW, second exporter**: a single self‑contained `file://`‑safe `.html` (§6). Both share the same `@cg/template-runtime` source.                                                                         |
| GDD embedded in export.                                                  | No GDD anywhere in the repo today.                                                                                                                                                                                                                                                                                                                        | Net‑new, exactly as the spec describes. Cover **all** field types, not just text/number (§4).                                                                                                                                                                                     |

**Two concrete bugs the original spec's acceptance test would expose** (details in §3):

1. `runtime.play()` **overwrites** field values, wiping data set by a prior `update()` — breaks `CG ADD …{data} 1` then `CG PLAY`.
2. The legacy‑XML payload path in `caspar-globals.ts` is a **stub** (`parsePayload` returns `{}` for XML).

---

## 1. The existing architecture (study first — Step 0)

Report these back before changing anything; most are already answered here, confirm in code:

- **Framework/state:** browser React SPA (no Electron). Zustand‑style store at
  `apps/designer/src/renderer/state/store.ts` (`designerStore`, `useDesignerSelector`).
  Renderer talks to a typed "bridge" (`apps/designer/src/shared/designer-bridge.ts`),
  implemented in `apps/designer/src/platform/*`.
- **Domain model (Zod, single source of truth):** `packages/shared-schema/src/`
  - `scene.ts` — `Scene` = `{ resolution, frameRate, frameRange, activeRange?, layers, fields, bindings, fonts, … }`. Use `activeRangeOf(scene)` for the play/export window.
  - `elements.ts` — `TextElement` shape: `text`, `font{family,weight,style,size,lineHeight,letterSpacing}`, `color`, `align`, `direction`, `fitMode: 'fixed'|'shrink-to-fit'|'autosize'`, `overflow: 'clip'|'ellipsis'|'shrink'`, `maxLines?`, `autoSqueeze?`, `wrap?`, `verticalAlign?`. **Auto‑size / auto‑squeeze already exist here** — reuse them, don't reinvent.
  - `fields.ts` — `DynamicField` discriminated union: `text | multiline | image | color | boolean | number | select`. `TextField` already has `default`, `maxLength`, `direction`. **Missing `minLength`, `pattern`** → add them (§2).
  - `bindings.ts` — `FieldBinding = { fieldId, target, transform? }`. `target.kind: 'text'` carries `elementId` + optional `placeholder` (e.g. `'{{name}}'`). With a placeholder the runtime does `original.replaceAll(placeholder, value)`; without it, full‑text replace.
- **Render layer:** `packages/template-runtime/src/`
  - `scene-builder.ts` → DOM tree + `elementMap: Map<id, HTMLElement>` + `textOriginals`.
  - `bindings.ts` → `applyFieldValues(scene, values, elementMap, textOriginals, container)` — the function that turns `{key:value}` into DOM text/colour/visibility/etc. This is the heart of "dynamic." Reuse verbatim.
  - `runtime.ts` → `createRuntime(scene)` returns `{ ready, play, update, stop, remove, tick, on }`.
  - `adapters/caspar-globals.ts` → installs `window.play/update/stop/next/remove` (the CasparCG contract).
  - `css.ts` → `BASELINE_CSS` (the hide‑until‑play + transparent‑stage rules).
- **Animation:** keyframe tracks per element (`animation.ts` schema; `animation-applier.ts`, `keyframe-eval.ts`, `frame-driver.ts`). Driven by `runtime.play()` (starts the frame driver) and `runtime.tick(frame)` (preview scrub). **There is no "steps" concept yet** and `runtime.next` is undefined (so `window.next()` is currently a no‑op) — see §3.
- **Inspector UI:** `apps/designer/src/renderer/features/inspector/InspectorPanel.tsx`.
  `ElementInspector` already renders `Transform`, `Style`, and a read‑only `Bindings`
  `CollapseSection`. **This is exactly where the new "Dynamic / Data" section goes.**
  ⚠️ **Naming collision:** `ElementInspector` already shows a field labelled **"Key"** —
  but that is `element.name`, _not_ a data‑binding key. Call the new concept
  **"Data key" / "Field key"** to avoid confusion. Do not overload the existing "Key" row.
- **Fields panel:** `apps/designer/src/renderer/features/fields/FieldsPanel.tsx` (scene‑level field list + "Bind from canvas"). Store mutators that already exist: `addField`, `updateField`, `removeField`, `addBinding`, `removeBindingAt`, `setBindMode`.
- **Export/preview platform:** `Exporter.ts` (→ `.vcg` via `@cg/vcg-format` `pack()`), `preview.ts` (iframe harness). Both receive the runtime bundle as strings `cgJs`/`cgCss` from `apps/designer/src/platform/cg-runtime.js`, wired in `createDesignerBridge.ts`.

**Where each new feature plugs in** (propose/confirm in Step 0):

- Field schema extension → `packages/shared-schema/src/fields.ts`.
- Element‑centric convenience layer → `apps/designer/src/renderer/state/store.ts` + a new
  `features/inspector/DynamicDataSection.tsx`.
- GDD generator → new module `packages/vcg-format/src/gdd.ts` (or a small new pkg `@cg/gdd`).
- Single‑file exporter → new `apps/designer/src/platform/ExporterSingleFile.ts` + an IIFE
  runtime build (§6).
- Preview form → new `features/fields/PreviewFieldForm.tsx` driven from `scene.fields`.

---

## 2. Feature 1 — Dynamic text fields (the convenience layer)

**Decision needed from the product owner before coding** (recommended default below):

> **A text element is "dynamic" when it has a non‑empty Data key.** Setting a Data
> key in the inspector **auto‑creates/updates a scene‑level `field` (id = key) and a
> `binding` (fieldId = key → `{kind:'text', elementId}`)**. Clearing the key removes
> both. The `fields[]`+`bindings[]` arrays remain the single source of truth that the
> runtime, GDD generator, preview form, and exporters all read from.
>
> This gives the simple Loopic‑style UX the spec wants **without** forking the data
> model. The alternative (storing `key/title/…` directly on the element) would create
> a second, conflicting field system and break the existing runtime/starters — **not
> recommended.**

### 2a. Schema (`packages/shared-schema/src/fields.ts`)

Add to `TextFieldSchema` (and `MultilineFieldSchema` where sensible):

- `minLength?: number (int, ≥0)`
- `pattern?: string` (regex source)

`label` already covers the spec's `title`; `description`, `required`, `default` already
exist on the base/text field. `fieldType: "text"|"number"` maps to the existing field
`type` (`text`/`multiline` for text, `number` for number). `multiline` maps to using the
`multiline` field type **and** the element's existing `wrap`/`maxLines` props — keep them
in sync.

### 2b. Store convenience helpers (`state/store.ts`)

Add methods, e.g.:

- `setElementDataKey(elementId, key)` — validates uniqueness across `scene.fields`
  (and across the whole project incl. compositions, mirroring `Exporter.preflight`'s walk);
  on first set, `addField` + `addBinding`; on change, rename field id + update binding;
  on empty, `removeField` + remove the matching binding (find its index by `fieldId`).
- `setElementFieldMeta(elementId, patch)` — patch `title/description/required/minLength/maxLength/pattern/default` on the backing field.
- Binding target: default to **full‑text replacement** (`{kind:'text', elementId}`, no
  placeholder) since the convenience UX binds the _whole_ element's text. (Placeholders
  remain available for hand‑authored multi‑slot text — don't remove that path.)

### 2c. Inspector UI (`features/inspector/DynamicDataSection.tsx`)

New `CollapseSection title="Dynamic / Data"` shown **only for `type === 'text'`** elements
in `ElementInspector`. Controls: Data key (text), Title, Description, Required (checkbox),
Field type (text/number), Multiline (checkbox, mirrors element), Min/Max length, Pattern,
Default value. **Validate key uniqueness live**; warn on duplicate keys; empty key = static
(and removes the backing field/binding). Reuse the existing `controls.tsx` inputs.

**Pause for review after Feature 1** (schema + store + inspector section only), as the spec asks.

---

## 3. Feature 2 — Shared runtime (mostly exists; fix + extend)

The runtime contract and globals already exist and already satisfy the CasparCG/CEF
shape (`window.play/update/stop/next/remove`, transparent stage, fixed size from
`scene.resolution`, no network at runtime). **Reuse `createRuntime` + `installCasparGlobals`.**
Required changes:

**Bug #1 — `play()` wipes prior `update()` data.** In `runtime.ts`, `play()` does
`currentValues = { ...data }` (replace). In the CasparCG flow `CG ADD … "{data}" 1`, the
host calls `update(data)` then `play()` **with no args**, so `play({})` blanks the data and
the graphic shows placeholder/empty on air. **Fix:** merge instead —
`currentValues = { ...currentValues, ...data }` — so play with no data preserves prior
`update`, and play with data still updates. (This is the spec's "order doesn't matter"
requirement; add a test for `update` → `play()` and `play()` → `update`.)

**Bug #2 — legacy XML payload is a stub.** `parsePayload` in `caspar-globals.ts` returns `{}`
for strings starting with `<`. Implement the CasparCG legacy format:
`<templateData><componentData id="KEY"><data id="text" value="VALUE"/></componentData>…</templateData>`
→ `{ KEY: VALUE }`. Accept **both** a JSON string and an already‑parsed object (the spec
requires both); keep JSON as canonical. Ignore unknown keys (already true — bindings only
apply known fields). Apply `maxLength` truncation in `applyFieldValues`/`stringifyValue`
(text targets) and rely on the element's existing auto‑size/auto‑squeeze for fit.

**`next()` / steps.** `runtime.next` is undefined today and there is no steps model. For
v1, keep `next()` a **safe no‑op** for single‑step templates (so `CG NEXT 1` returns OK and
does nothing — acceptable for a 1‑step graphic). Add a code comment. Full multi‑step support
is out of scope for this brief — flag it as a follow‑up.

**Auto‑remove after stop.** `stop()` runs the OUT/hide; `remove()` is cleanup. Whether
CasparCG auto‑calls `remove()` after `stop()` is version‑dependent — **verify against the
target CasparCG build and add a short comment** in `caspar-globals.ts`. Don't assume.

---

## 4. Feature 3 — GDD schema (net‑new, modular)

New module `packages/vcg-format/src/gdd.ts` exporting `buildGddSchema(scene): object`.
Embedded by the single‑file exporter (§6) inside `<head>` exactly as:

```html
<script name="graphics-data-definition" type="application/json+gdd">
  { …generated… }
</script>
```

Top‑level shape and `gddPlayoutOptions` exactly as in the original spec
(`$schema: https://superflytv.github.io/GraphicsDataDefinition/gdd-meta-schema/v1/schema.json`,
`type: "object"`, `properties`, `required`, `gddPlayoutOptions.client.{duration,steps,dataformat:"json"}`).

Generation rules — **cover the whole `DynamicField` union** (the original spec only named
text/number; the model has 7 types):

- `text` → `{ type:"string", gddType: multiline ? "multi-line" : "single-line" }` + `minLength/maxLength/pattern/default` when set.
- `multiline` → `{ type:"string", gddType:"multi-line" }` + `maxLines`→ informational; `default`.
- `number` → `{ type:"number" }` + `minimum/maximum/default` when set.
- `color` → `{ type:"string", gddType:"color-rrggbb", pattern:"^#[0-9a-fA-F]{6}$", default }`.
- `boolean` → `{ type:"boolean", default }`.
- `select` → `{ type:"string", enum:[…], default }`.
- `image` → emit a string field but **flag in preflight** that image resource handling
  for third‑party GDD clients is not finalized (the project's own Runtime resolves
  `assetId`; a foreign client can't). Don't block export; warn.
- `required:true` → push key into top‑level `"required"`.
- `duration` = `(activeRangeOf(scene).out - .in) / scene.frameRate * 1000` ms (or `null` if
  the composition is "manual out"); `steps` = 1 for now.
- Confirm exact `gddType` strings against the v1 meta‑schema while implementing.

**Modularity (spec's heads‑up):** put the generator behind a tiny interface
(`SchemaExporter`) so an `ograf.ts` exporter can be added later without touching the
single‑file exporter. Do **not** implement OGraf now — current CasparCG clients consume GDD;
OGraf's Graphics Definition is v1‑stable but its control API is still draft.

The runtime's `update(data)` already consumes exactly `{ "<key>": value, … }`, which matches
the schema — no change needed there beyond §3.

---

## 5. Feature 4 — Live preview (harness exists; add the form)

Reuse `preview.ts` + the canvas iframe (`features/canvas/CanvasArea.tsx`) — it already runs
the real runtime and already handles `postMessage` `update`/`scrub`/`play`/`stop`/`scene-replace`.
Add:

- **`features/fields/PreviewFieldForm.tsx`** — auto‑generated from `scene.fields`
  (which the convenience layer populates): text→`<input>`, multiline→`<textarea>`,
  number→`<input type=number>`, plus color/boolean/select for completeness. Show `label`
  (title), mark `required`, validate against `pattern`/`minLength`/`maxLength`. Seed inputs
  from each field's `default`.
- On any change, call `bridge.preview.update(values)` → existing `postMessage({action:'update', fields})`
  → `window.update(JSON.stringify(values))` → `applyFieldValues`. (Plumbing already exists end‑to‑end; you're only adding the producer of `values`.)
- Controls **Play / Stop / Next / Reset** wired to the iframe: `play`/`stop` already handled
  in `preview.ts`; **add `next`** (calls `window.next()`) and **`reset`** (re‑seed defaults
  and `update`) to the preview message handler.
- Background: keep the existing authoring checkerboard (already in `preview.ts`) to visualize
  alpha; stage is `scene.resolution`, **scaled to fit** the preview area (preview‑only — the
  exported file renders at native channel resolution).

---

## 6. Feature 5 — Single‑file CasparCG export (NEW, alongside `.vcg`)

New `apps/designer/src/platform/ExporterSingleFile.ts` producing **one self‑contained `.html`**
to drop into CasparCG's `templates/`. Add a **"Download HTML"** action (next to the existing
`.vcg` export in `features/shell/TopToolbar.tsx`).

Requirements:

- **Inline everything, no external refs, no ESM, no `fetch`** — this is what makes it
  `file://`‑safe (the existing `.vcg` `index.html` deliberately does NOT meet this and is for
  http serving only):
  - Inline the scene JSON as a JS object literal (not `fetch('./template.json')`).
  - Inline CSS (`cg.css` + any `@font-face`).
  - Inline the runtime as a **classic IIFE `<script>`**, not a module. → **Add an IIFE/UMD
    build target** of `@cg/template-runtime` (e.g. `cg.iife.js` exposing
    `window.CG = { createRuntime, installCasparGlobals }`) and feed it to this exporter the
    same way `cgJs` is fed today (via `cg-runtime.js`). **Same TS source as preview/`.vcg`** —
    only the bundle format differs, so the "single source of truth" rule holds.
  - Embed images as **base64 data URIs**; embed fonts as **base64 `@font-face`**.
- Include the embedded **GDD `<script>`** from §4. Optionally also expose
  `window.gddSchema = …` (some tooling reads it).
- Bootstrap (inline classic script): build the runtime, `installCasparGlobals`, `await ready`.
  Do **not** auto‑play (operator/AMCP drives `play`).
- `html,body { background: transparent }`; stage sized to `scene.resolution` (default 1920×1080).
- **CSP:** the strict `.vcg` CSP (`script-src 'self'`, `style-src 'self'`, `font-src 'self'`)
  is **incompatible** with a single inlined file. For this exporter use a permissive policy
  that allows inline script/style and `font-src data:` (or omit the meta CSP for the
  `file://` template). Add a comment explaining why it differs from the `.vcg`.
- **CEF compatibility:** keep CSS within common CasparCG CEF builds — **CEF 63 (2.2),
  71 (2.3.x), 117 (2.4.x)**; newer builds (2.5/2.6) ship modern Chromium. Avoid bleeding‑edge
  CSS; prefer broadly supported properties. Add a brief comment. **If the target is 2.3.x
  (CEF ≈ 71), test the IIFE bundle's output JS against that engine** (no top‑level await, no
  very new syntax).

---

## 7. Acceptance criteria (unchanged from the spec — keep them)

- A composition with two text fields `f0` (title) + `f1` (subtitle) exports one `.html`.
- Dropped into CasparCG `templates/`, these work (ch 1, layer 20, cg layer 1):
  - `CG 1-20 ADD 1 "MyTemplate" 1 "{\"f0\":\"Hello\",\"f1\":\"World\"}"`
  - `CG 1-20 PLAY 1` → text stays "Hello/World" (verifies bug #1 fix)
  - `CG 1-20 UPDATE 1 "{\"f0\":\"Updated\"}"`
  - `CG 1-20 NEXT 1` (no‑op OK for a 1‑step template)
  - `CG 1-20 STOP 1`
- Opened directly in Chrome: no console errors; `window.update({f0:'x'})` then `window.play()`
  updates **and** animates (works in either order).
- Preview behavior == exported‑file behavior (same runtime source).
- Embedded GDD parses as valid JSON‑schema and lists both fields with correct types/constraints.

**Background facts that justify the AMCP path above (verified against current CasparCG docs):**
`CG UPDATE` is the command that calls the page's `update()` and is the _only_ data‑bearing CG
command; `CG INVOKE` takes no parameters (which is why an earlier spike in this repo —
`docs/adrs/0006-amcp-update-mechanism-unresolved.md` — failed to pass data). `CG UPDATE`
sent too soon after load can return `403`; allow a brief readiness window / retry.

---

## 8. Constraints & process

- **Reuse** existing render/animation/runtime/preview code — do **not** duplicate it. Preview
  and both exporters share the one `@cg/template-runtime` source.
- **Don't break the existing editor** or the `.vcg` path.
- Strict TS, no `any`; conventional commits; `vitest`. Run the green gate for touched
  workspaces: `pnpm turbo run build typecheck lint test --filter …`.
- Follow the repo workflow in `CLAUDE.md`: this is a good candidate for **one OpenSpec change**
  (`pnpm openspec new change add-caspar-dynamic-export`) with one `#### Scenario` per
  acceptance bullet, plus PRD items (e.g. new `D-018` dynamic fields, `D-019` single‑file
  CasparCG export) — author the change before/with the code.

## 9. START HERE

1. **Step 0** — explore and confirm §1 against the code; report the text‑element shape,
   render path, animation/`next` reality, and the exact inspector insertion point.
2. **Feature 1 only** — schema (`minLength`/`pattern`), store convenience helpers, and the
   "Dynamic / Data" inspector section. **Then pause for review.**
3. Do not start Features 2–5 until Feature 1 is reviewed.

## 10. Open questions for the product owner (answer before/at Step 0)

1. **Target CasparCG version** — 2.3 LTS (CEF ≈ 71) or 2.4/2.5/2.6 (modern CEF)? Decides the
   IIFE JS/CSS floor and whether to worry about `file://` ESM at all.
2. **Third‑party‑client interop** (SuperConductor / CasparCG Client) needed, or only this
   project's own Runtime? If only your own Runtime, GDD (Feature 3) drops in priority.
3. **Convenience‑layer vs. keep the separate Fields panel** — confirm the §2 recommendation
   (element Data key auto‑syncs `fields[]`+`bindings[]`). Default = yes.
