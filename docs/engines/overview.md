# Engine architecture — the big picture

> **Read this first.** It's the map of how a graphic flows from the canvas editor
> to air. Each engine has its own deep-dive (linked below); this page is how they
> fit together. Keep it in sync — see the doc-sync rule in
> [`CLAUDE.md`](../../CLAUDE.md).

## The one-sentence version

The **Designer** edits a **`Scene`** (a [`@cg/shared-schema`](../../packages/shared-schema)
Zod document); [`@cg/template-runtime`](../../packages/template-runtime) turns that
same `Scene` into live DOM and drives its animation + playout; the **same runtime
code** powers the Designer's preview, the exported single-file HTML, and CasparCG
playout — so **what the Designer shows IS what airs**.

## Data flow

```
            AUTHOR (Designer canvas editor)
                       │  edits
                       ▼
            ┌──────────────────────┐
            │   Scene  (in memory)  │   one Zod document: layers/elements,
            │   @cg/shared-schema   │   fields, bindings, animation tracks,
            └──────────────────────┘   lifecycle, playout, compositions
                       │
        ┌──────────────┼───────────────────────────┐
        │ build+drive  │ pack                       │ pack
        ▼              ▼                            ▼
 ┌─────────────┐  ┌──────────────┐         ┌─────────────────────┐
 │  Preview    │  │  .vcg package │         │ single-file HTML     │
 │  iframe     │  │  @cg/vcg-format│        │ (file://-safe IIFE)  │
 └─────────────┘  └──────────────┘         └─────────────────────┘
        │                │                           │
        └────────────────┴───────────┬───────────────┘
                                      ▼
                         @cg/template-runtime
                  createRuntime(scene) → DOM + animation
                  + applyFieldValues   (live data binding)
                  + PlayoutController   (in → hold → out, loop/auto-out)
                                      │
                          installCasparGlobals(runtime)
                                      ▼
                    CasparCG HTML producer calls
                  window.play / update / stop / next / remove
```

### 1. Authoring → `Scene`

The Designer's canvas editor and inspector mutate a `Scene` in renderer state.
Every domain shape (elements, fields, bindings, keyframe tracks, lifecycle,
playout, nested compositions) is a **Zod schema in `@cg/shared-schema`** — the
single source of truth for the data model. The editor never invents structure the
schema doesn't define; **a data-model change starts in the schema**, then flows to
the editor UI and the runtime renderer (the "Where features go" map in
[`CLAUDE.md`](../../CLAUDE.md)).

### 2. `Scene` → live DOM (the runtime)

[`@cg/template-runtime`](../../packages/template-runtime)'s `createRuntime(scene)`:

- **builds** the DOM tree from the scene (scene-builder),
- **applies** the current field values onto that DOM by walking the scene's
  declared bindings (`applyFieldValues`),
- **animates** keyframed properties per frame (animation-applier + keyframe-eval),
- **drives** the broadcast lifecycle and playout timing — entrance → hold → exit,
  auto-out / loop cycles with timed or content-driven holds (PlayoutController +
  FrameDriver; the ticker's TickerDriver, the countdown clock's ClockDriver, and
  the finite sequence's SequenceDriver signal content completion for
  content-driven holds; `runtime.next()` dispatches per scope to sequence
  drivers — the D-031 steps seam; the repeater's RepeaterDriver stamps one
  child-composition scope per data row through the `wireScopeSubtree`
  factory — count at play, values live),
- cascades all of the above through **nested composition instances**.

The renderer talks to its "backend" only through the typed `window.cg` bridge; the
runtime is the thing on the other side of that seam for graphics. See the
[template-runtime deep-dive](../../packages/template-runtime/README.md) for how it's
built and how to extend it.

### 3. `Scene` → preview / export (same runtime, three outputs)

The runtime source is bundled once into two payloads
(`apps/designer/scripts/bundle-runtime.mjs` → `cg-runtime.js` ESM +
`cg-runtime.iife.js` IIFE) so all three consumers run identical logic:

| Output               | Who runs it                   | How the runtime is delivered                                                  |
| -------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| **Preview iframe**   | Designer, live while editing  | ESM bundle injected via `srcDoc`                                              |
| **`.vcg` package**   | the Runtime app / a CG server | ESM bundle inside the package ([`@cg/vcg-format`](../../packages/vcg-format)) |
| **Single-file HTML** | CasparCG (file://)            | IIFE bundle, exposes `window.CG`, targets old CEF                             |

The exported `index.html` calls `createRuntime(scene)` then
`installCasparGlobals(runtime)`, which wires CasparCG's bare global calls
(`play`/`update`/`stop`/`next`/`remove`, JSON **or** legacy XML payloads) to the
typed runtime.

**Image assets (D-062 + D-040).** The runtime emits `<img data-cg-asset-id>` and
takes an `assetUrls` boot option that wires each `src`. Image bytes are resolved
through one seam — `resolveImageAsset` / `collectImageElements` in
[`apps/designer/src/platform/image-export.ts`](../../apps/designer/src/platform/image-export.ts) —
and inlined per output (preview: host blob URLs; `.vcg`: packaged relative paths;
HTML: base64 data URIs). An image element's `source` (`'project' | 'shared'`)
selects which store its `assetId` resolves from: a per-project `AssetStore` or the
device-level `SharedImageStore` (the shared image library; a `source: 'shared'`
image is a "logo"). `compositeImageSource` tries the source-indicated store first
and the other as a fallback, so the same resolver covers all three outputs; a
reference that resolves in neither store is reported by `Exporter.preflight`
(`.vcg` blocks, HTML warns) and renders a placeholder in preview.

## The editor ↔ schema ↔ runtime triangle

```
        edits / validates            renders / drives
 editor ───────────────► Scene ◄─────────────── runtime
   ▲      (shared-schema)        (template-runtime)  │
   └──────────────────────────────────────────────┘
        preview reflects exactly what the runtime produces
```

- **Schema is the contract.** Both the editor and the runtime depend on
  `@cg/shared-schema`; neither encodes the data model independently. Change the
  schema and both sides adapt.
- **The runtime is the renderer of record.** The Designer does not have a second,
  "preview-only" renderer — it embeds the real runtime. This is deliberate: it
  removes preview/playout drift.
- **Behaviour lives in specs, not prose.** The _what_ (the behavioural contract for
  lifecycle/timing, animation, bindings) is captured in OpenSpec living specs and
  changes under [`openspec/`](../../openspec); the engine docs describe _how it's
  built_. Don't duplicate behaviour between them.

## Where the engines live

| Engine / package                                          | Responsibility                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`@cg/shared-schema`](../../packages/shared-schema)       | The data model (Zod): scenes, elements, fields, bindings, animation, lifecycle, playout, compositions. |
| [`@cg/template-runtime`](../../packages/template-runtime) | Build DOM from a scene, bind data, animate, drive lifecycle/playout. **The heart.**                    |
| [`@cg/vcg-format`](../../packages/vcg-format)             | Isomorphic pack / unpack / verify of `.vcg` template packages.                                         |
| [`@cg/text-shaping`](../../packages/text-shaping)         | Persian/RTL-aware transforms (digits, dates, truncation) used by bindings.                             |
| [`@cg/lottie-bridge`](../../packages/lottie-bridge)       | Lottie integration (field overrides land with M3.3).                                                   |
| `apps/designer`                                           | Canvas editor, inspector, preview, exporters.                                                          |
| `apps/runtime`                                            | Playout controller (CasparCG via the local bridge / mock).                                             |

## Deeper reading

- **template-runtime deep-dive (how it's built + how to extend it):**
  [`packages/template-runtime/README.md`](../../packages/template-runtime/README.md)
- **Canvas editor deep-dive (the editing surface that overlays the runtime):**
  [`apps/designer/src/renderer/features/canvas/README.md`](../../apps/designer/src/renderer/features/canvas/README.md)
- **Animation timeline deep-dive (the keyframe model + the authoring dock/inspector):**
  [`apps/designer/src/renderer/features/timeline/README.md`](../../apps/designer/src/renderer/features/timeline/README.md)
- **Behavioural specs:** [`openspec/specs/`](../../openspec/specs) and the changes
  under [`openspec/changes/`](../../openspec/changes) (e.g. nested-lifecycle-cascade,
  nested-composition-field-scoping, animation-lifecycle-timing).
- **Browser migration & roadmap:**
  [`docs/adrs/0007-electron-to-browser-migration.md`](../adrs/0007-electron-to-browser-migration.md),
  [`docs/phases/phase-10-browser-migration.md`](../phases/phase-10-browser-migration.md).
