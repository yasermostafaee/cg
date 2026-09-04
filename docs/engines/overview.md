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
- **animates** keyframed properties per frame (animation-applier + keyframe-eval;
  values are numbers, hex colours, or D-110 whole-shape path snapshots — the
  path morph interpolates anchors by stable id via the schema's shared
  `lerpPathSnapshot` and feeds the same `pathD` builder the static render uses),
- **renders a content-driven HOLD as a repeating `[contentStart → outPoint]`** — D-133's
  hold loop: the furniture replays the range while the content runs, instead of the
  timeline parking on one frame. It is a RENDERING of the existing hold, not a new phase
  and not a new `PlayoutMode`: the range is the two shipped lifecycle markers, and the
  hold's start/end conditions and the OUT after it are unchanged. 🔴 The wrap re-renders the
  COMPOSITION FRAME ONLY — it cannot reset or restart a content driver, because the loop
  driver's sole output is `applyFrame` and a content driver runs on its own clock. Under any
  hold that is not content-driven the range is INERT (the Designer's Playout panel says so,
  and names the missing condition),
- **drives** the broadcast lifecycle and playout timing — entrance → hold → exit,
  auto-out / loop cycles with timed or content-driven holds (PlayoutController +
  FrameDriver; the ticker's TickerDriver, the countdown clock's ClockDriver, and
  the finite sequence's SequenceDriver signal content completion for
  content-driven holds; `runtime.next()` dispatches per scope to sequence
  drivers — the D-031 steps seam; the repeater's RepeaterDriver stamps one
  child-composition scope per data row through the `wireScopeSubtree`
  factory — count at play, values live),
- **positions frame-mapped media at the Designer playhead** — D-135: `tick(frame)`
  reaches every `LottieDriver` AND every `VideoDriver` (`positionAt`), so scrubbing AND
  timeline play animate a Lottie and a `<video>` on the canvas instead of leaving them on
  a static poster frame. The canvas has no `play()` path of its own — its transport
  advances the frame and posts one `scrub` per change — so scrub and play are literally
  the same call, and the driver's own phase mapping (`clipPositionAt` / `expectedClipMs`)
  is what resolves the clip frame/time (never a second copy). A driver that is running
  its own lifecycle owns the frame and is not fought. The video is positioned PAUSED by
  `currentTime` (§9.5 (a) — the forward-1× hybrid rejected): a tick that finds a seek in
  flight skips, so play shows the nearest decodable frame while the Preview stays the
  frame-true rendition; the node is resolved through the handle's `live()` on every
  access (B-137), and the at-rest canvas poster is now a pre-tick transient for video
  exactly as for the Lottie. The ticker, the clock and the sequence are DELIBERATELY
  carved out: they are functions of real time, with no frame N of a crawl to show,
- **derives FOLLOW-source media windows from the composition's lifecycle** —
  `media-phases-follow-composition`: a Lottie/video whose `phases.source` is
  `'composition'` stores the RELATIONSHIP (intro settles at the content start, outro fits
  the OUT segment, hold at `holdAt`), and `createRuntime` derives the concrete window at
  driver construction through `followWindowMs` (`@cg/shared-schema`) + the
  `lottieFollowWindow` unit adapter (`@cg/lottie-bridge`) — one derivation, re-run on
  every scene replace, never baked. A follower contributes nothing to the entrance
  settle (it derives FROM it),
- lets an **element own its own exit** — the D-125 element-outro seam: `out()` /
  `stop()` route every owning driver through a ONE-SHOT ledger and await it before the
  background closes. That await is **bounded at the ledger entry** (session Z): a driver
  whose `playOutro()` never settles would otherwise strand the exit — and, because
  `stop()`/`out()` are guarded on the lifecycle state, take every later operator command
  with it — so the bound fires an `error` event and lets the exit proceed,
- **parks the content of a LOOK that is not on screen** — `B-150`: a look switch shows one
  composition instance and hides the rest with `display: none`, and hiding a node stops
  nothing inside it. `LookMediaPark` (`look-media.ts`) SILENCES hidden content
  unconditionally and PAUSES it as the policy half, reviving it IN PLACE — `VideoDriver`
  re-anchors to the media position rather than seeking, so a switch back is seamless.
  `B-217`: a revive is owed ONLY to a driver that was running when parked (`isRunning()` is
  asked before the pause) — `VideoDriver.resume()` / `LottieDriver.resume()` START a
  never-started driver, and a blind revive set clips playing in the Designer canvas, which
  never plays. Membership is asked of the DOM (`Element.contains`) because `display: none` is
  a DOM fact and a parallel table could disagree with what is on screen; the video registers
  its node as a getter (`live()`), so a node the preview's pool transplanted is still the one
  asked. 🔴 Two things are deliberately
  never parked: content that GATES A HOLD (a paused driver never completes, so the graphic
  would never come off air) and CLOCKS (a parked countdown returns claiming time it does not
  have). ⚠ The pause is the half a future operator toggle governs; the silence is not a
  policy and must not become one,
- cascades all of the above through **nested composition instances**.

The renderer talks to its "backend" only through the typed `window.cg` bridge; the
runtime is the thing on the other side of that seam for graphics. See the
[template-runtime deep-dive](../../packages/template-runtime/README.md) for how it's
built and how to extend it.

### 3. `Scene` → preview / export (same runtime, three outputs)

The runtime source is bundled once into two payloads
(`packages/single-file-export/scripts/bundle-runtime.mjs` → `cgJs` ESM +
`cgJsIife` IIFE) so all three consumers run identical logic:

| Output               | Who runs it                   | How the runtime is delivered                                                  |
| -------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| **Preview iframe**   | Designer, live while editing  | ESM bundle injected via `srcDoc`                                              |
| **`.vcg` package**   | the Runtime app / a CG server | ESM bundle inside the package ([`@cg/vcg-format`](../../packages/vcg-format)) |
| **Single-file HTML** | CasparCG (file://)            | IIFE bundle, exposes `window.CG`, targets old CEF                             |

The exported `index.html` calls `createRuntime(scene)` then
`installCasparGlobals(runtime)`, which wires CasparCG's bare global calls
(`play`/`update`/`stop`/`next`/`remove`, JSON **or** legacy XML payloads) to the
typed runtime.

**The served bundle runs on CasparCG's CEF, not a modern browser (B-066).**
The compat baseline is **Chromium 71** (CasparCG 2.3 LTS). esbuild `target`
lowers SYNTAX only — newer built-in METHODS (`replaceAll` et al.) pass
straight through a correctly-targeted bundle and abort the template at boot
on air. Guards: the broadcast-tier lint bans post-baseline built-ins at the
source line (`@cg/eslint-config` `cef-compat`, one curated list) and
`@cg/single-file-export`'s `cef-compat.test.ts` scans the exact emitted
bundle artifacts (covers bundled dependencies too); every CasparCG-facing
esbuild target is pinned to `chrome71`.

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
| [`@cg/lottie-bridge`](../../packages/lottie-bridge)       | Lottie import allowlist, marker→phase mapping, and the `lottie_light` player mount (D-125).            |
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
