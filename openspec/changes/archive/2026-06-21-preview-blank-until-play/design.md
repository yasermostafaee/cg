# Design — Preview blank until Play (D-087)

## Context

`platform/preview.ts` `#buildHtml(scene)` builds ONE self-contained iframe document used by
**two** surfaces via `window.cg.preview.load`:

- the editor **canvas** (`CanvasArea`) — must show the static authoring frame so the operator
  can edit;
- the **Preview modal** (`PreviewModal`) — has a Play/Pause/Stop/Next transport.

The runtime is already blank-until-play: `createRuntime` adds `body.cg-pending`
(`runtime.ts:122`), `play()` removes it (`runtime.ts:511`), settle/`stop()` re-adds it
(`runtime.ts:183`); `.cg-pending .cg-stage { visibility: hidden }` (`css.ts`) hides the
stage. The exported `.vcg`/HTML inherit this. The preview defeats it on purpose, in two
spots in `#buildHtml`:

1. a CSS `!important` override lifting `.cg-pending` (so the stage is visible);
2. `applyScene` removes `cg-pending` then `tick(0)` on boot (render + reveal frame 0).

## Decision: a `broadcast` flag on `preview.load`, scoped to the modal

Add `broadcast?: boolean` to the `PreviewLoadChannel` request and thread it
`load(scene, broadcast)` → `#buildHtml(scene, broadcast)`. The modal passes `true`; the
canvas omits it.

When `broadcast` is set, `#buildHtml`:

- **omits** the `.cg-pending` CSS override block (the stage obeys the baseline hide); and
- **gates off** the boot-time `cg-pending` removal in `applyScene` via an injected
  `REVEAL_ON_LOAD` constant, so the body keeps the `cg-pending` that `createRuntime` set.

`tick(0)` still runs (paints under the hidden stage), so the first Play is instant and shows
the correct first frame. Nothing else changes: `play()` clears `cg-pending` natively, `stop()`
re-adds it, `pause`/`resume`/`next` behave as today.

### Why a flag on the document, not a postMessage toggle

The pending state must be correct from the very first paint (no flash of frame 0). Baking the
decision into the generated HTML (CSS omitted + `REVEAL_ON_LOAD=false`) means the iframe is
blank from boot, and every subsequent `applyScene` (a session timing-override
`scene-replace`) honours the same flag with no extra plumbing. A post-load "re-hide"
postMessage would flash frame 0 first and would have to be re-sent on each rebuild.

### Why gate two places, not one

The override and the `applyScene` removal are independent: each alone would reveal the stage
(the CSS forces visibility; the class removal drops `cg-pending` entirely). Both must be
conditioned on `broadcast` for the stage to stay blank.

### Why not change the runtime or the canvas

The runtime is already correct and is shared verbatim with the export — touching it would
risk the on-air path the task explicitly fences off. The canvas needs the static frame for
editing, so it keeps the default (authoring) behaviour by omitting the flag.

## Consequences

- A session timing-override change (`scene-replace`) re-runs `applyScene`, so in broadcast
  mode the modal re-blanks until the operator plays again — consistent with the broadcast
  "re-ADD ⇒ blank until PLAY" model.
- Field edits before Play still apply to the (hidden) runtime and are merged by `play()`
  (CG UPDATE-then-PLAY semantics), so the first painted frame reflects the edited data.
- Existing preview E2E that asserted modal **stage** content before Play move those checks to
  after Play; sidebar/form, `toHaveCSS`, and `toHaveText` assertions are unaffected.
