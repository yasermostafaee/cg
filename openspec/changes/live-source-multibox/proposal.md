# Live Source multi-box — one change, two filed items

## Why

The client authors multi-frame shows — two guest boxes, each carrying its own live input, Cinegy
plate-style. An HTML template under CEF cannot render SDI or NDI, so the template renders a frame
with a **fully transparent hole** and CasparCG composites the mapped live source on a **lower
layer** behind it.

This is filed twice: **D-137** (`docs/prd/designer.md:3557`, the Live Source element) and
**C-015** (`docs/prd/caspar.md:365`, the routing). Both are `high`, both are RECON-FIRST, and both
owe a `design.md`.

**They are authored here as ONE change, and the reason is measured, not stylistic.** Every
load-bearing problem sits at the **seam** between the two halves:

- A source id must cross from an export to the bridge — and the recon established that **no `.vcg`
  ever reaches the bridge** (it is unpacked in the browser; what crosses is
  `{ template: TemplateInfo, html }`), that the **bridge parses no HTML**, and that the **scene is
  discarded after import** (`LibraryEntry` is `{ template, html }`,
  `apps/runtime/src/platform/library/LibraryStore.ts:10-13`).
- A hole's rect must become a `MIXER FILL` — and the term the bridge is missing
  (`scene.resolution`) lives on the Designer side of the seam.
- A live layer must be **owned** by the bridge — and the only discriminator the bridge has today is
  the OSC producer kind, which is exactly what a non-html bridge-owned layer breaks.

Designing the halves separately is what left that seam unspecified for two months. Splitting them
again would repeat it.

## What changes

1. **A Live Source element** in the Designer: an axis-aligned region carrying a **symbolic** source
   id (plus an optional key id, an `expectedAspect` and an optional poster), rendered as procedural
   SMPTE bars on the authoring surfaces and as **zero painted pixels** in both exports.
2. **A declared Live Source layer class** in the bridge — a third ownership notion beside the fixed
   operator rows and the reserved playout range, recorded in a bridge-owned ledger rather than
   inferred from producer kind.
3. **Two CG Control surfaces**, persisted bridge-side and edited by the operator. **This is the gap
   the owner named as the blocker**, and before this change it was two English sentences in
   `docs/prd/caspar.md:371-373` and nothing else.
   ⭐ **RESHAPED 2026-08-10 (owner, `design.md` §2z / §2d)** from the single store phase 4 first
   shipped: the installation DEFINES a list of **NAMED** lives with no reference to any template
   (a `DECKLINK` / `route://` / NDI / media producer each), and each imported template gets, **per
   live plate, a property naming one of them**, set in the **Inspector** when that template is
   selected. Binding by name match silently required the AUTHOR to guess the installation's naming
   convention, which contradicts §12.1's own principle; the explicit assignment removes the guess and
   leaves the template exactly as portable as before.
4. **A producer verb and a fit verb** on the AMCP command seam, which today can emit seven
   commands, none of which can start a non-html producer. The fit verb emits `FILL` and `CLIP` as
   an inseparable pair — measured, they are two halves of one geometry and setting either alone can
   render the layer blank.
5. **One audio rule** covering R-029, R-042 and Live Source audio, which the recon established are
   one problem, not three.

## What does NOT change

- **The schema type stays `video-placeholder`.** Renaming it is a scene migration and is
  deliberately out of scope (`docs/prd/caspar.md:423-425`). The schema is extended **additively**;
  the D-128 freeze forbids REPURPOSING it, not implementing it.
- **Shapes stay as they are.** A Live Source is a compositing contract with the runtime, not a fill
  mode on a shape.
- **Rotation and non-rect Live Sources are out of scope in v1** — `MIXER FILL` is axis-aligned.
- **No `.vcg` format change is required** by the chosen carrier (see `design.md` §1).

## Impact

| Area                   | Effect                                                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cg/shared-schema`    | additive fields on `VideoPlaceholderElementSchema`; one new `BindingTarget` variant; one new preflight code consumer                                                                                  |
| `@cg/shared-ipc`       | a `sources.*` channel family (catalog + assignments, each read/write/publish); `TemplateInfo` gains a declaration block; two refusal reason unions; the PURE validators, shared with the offline mock |
| `@cg/template-runtime` | a render mode seam (`buildScene` takes no mode argument today — `design.md` §9)                                                                                                                       |
| `@cg/caspar-client`    | no change to `LayerManager`'s two fences; a third declared class is bridge-side                                                                                                                       |
| `tools/caspar-bridge`  | a source CATALOG store and an ASSIGNMENTS store, the Live Source ledger, three new AMCP commands (`PLAY` / `FILL`+`CLIP` / `MIXER CLEAR`), the geometry derivation                                    |
| `tools/amcp-mock`      | producer classification, `MIXER FILL` + `CLIP` state — **without which none of the ownership work is testable**                                                                                       |
| `apps/designer`        | the element, its creation path (which does not exist today), SMPTE bars, preflight                                                                                                                    |
| `apps/runtime`         | the Live sources settings modal, and the Inspector's per-plate binding section                                                                                                                        |

## Relationship to R-028 (`runtime-unified-layer-rows`)

**This design must be agreed before R-028's section 6 is implemented.** Section 6 is entirely open
and would cement a **two-class** ownership model that has no room for a bridge-owned non-html
layer. The full argument, the task-by-task effect and the landing order are in `design.md` §4.

## Status

**DESIGN-FIRST. This change defines no implementation task as ready to start.** It is authored to
settle ten decisions and to unblock R-028's section 6. Two decisions in it belong to the owner and
are recorded as open questions rather than guessed — see `design.md` §12.
