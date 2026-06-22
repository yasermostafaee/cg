# Design — pasteboard extent grows to fit off-frame content (D-071 follow-up)

> **STEP-0 RECON** (original) — documents the seam, math, and recommended approach for sign-off.
>
> **STEP-1 IMPLEMENTED.** Sign-off locked: **Q1 = B** (grow only past the 2× boundary, full-margin
> headroom), **Q2 = current-frame only**, **Q3 = bound the instance's own box** (confirmed below —
> instances clip with `overflow:hidden`, so there is **no off-frame gap**), **Q4 = a generous
> max-extent clamp** (`MAX_EXTENT_RATIO = 12×`), **Q5 = `frameOffset` added explicitly to the ruler
> `measure` dep array**. Note §3's "open question (grow threshold)" recommended the always-union form;
> the locked decision is **B** (the §3 math/examples describe the union form — the shipped
> `pasteboardLayout` implements B: within the 2× boundaries it is byte-identical to today, growing
> only past them). The change scaffold (proposal/tasks/spec delta) and gate are part of STEP-1.
>
> **STEP-2 FIX (B-026 drag-drift).** A follow-up: dragging a shape far off-frame jittered the WHOLE
> canvas. Confirmed cause (not the §3 math, which is byte-identical within the 2× boundary): the seam-2
> scroll-comp (`useLayoutEffect`) runs **synchronously** per pointer-move, but the seam-1 `.cg-stage`
> inset it compensates for arrived a frame LATER via the **async** `scene-replace` postMessage (rAF +
> cross-document `await applyScene`) — so each move the host scrolled while the iframe inset lagged,
> drifting the frame + non-dragged content, then snapping back. Ruled out the secondary hypothesis: the
> shape-drag cursor→scene map (`beginDrag.onMove`) is a pure pointer-client delta (`startPos + (client −
start)/scale`), origin-independent, so there is no feedback loop. **Fix:** write the inset CSS vars
> **synchronously host-side** in the same scroll-comp layout effect (the iframe is a same-origin
> srcDoc), so inset + scroll land in one paint; the dragged shape keeps its existing ~1-frame
> `scene-replace`/gizmo-tracked render lag.

## Problem

D-071 Phase B shipped a **fixed** pasteboard extent. `geometry.pasteboardLayout(resolution)`
([geometry.ts:291](../../../apps/designer/src/renderer/features/canvas/geometry.ts)) returns
`extent = frame + PASTEBOARD_MARGIN_RATIO (0.5) × frame on each side` — a pure function of
**resolution**, ignoring where shapes are. `CanvasArea` sizes the scroll-content stage
([CanvasArea.tsx:619](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx)) and the
**iframe** ([:636](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx)) to that
extent. The iframe clips its content to its own element box, so a shape parked **more than ~50% of
the frame** beyond an edge leaves the iframe and is **clipped (invisible)**.

**Decision (to validate):** make the extent **grow-to-fit** — the union of `(frame + margin)` and
`(AABB of all shapes + margin)`, **floored** to today's 2× extent (it may grow, must **never** shrink
below 2×).

This is high-risk: the extent + the frame offset feed the iframe size, the iframe-internal
`.cg-stage` inset, the fit/center math, the cursor-anchored zoom, the rulers/guides, and the overlay
hit-test. A grow-to-fit extent makes the **origin movable**, which interacts with all of them.

---

## 1. EXTENT / OFFSET SEAM — every consumer (must all become content-aware together)

Today two derived values flow from `pasteboardLayout(resolution)`: **`extent` {width,height}** and
**`frameOffset` {x,y}** (the frame's inset; scene (0,0) lives there). Both are recomputed in the
`CanvasArea` render body and threaded to:

| #   | Consumer                                           | Location                                                                                                                                                                                                                      | Uses            | What it needs when content-aware                                                                     |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | iframe **document** load (bakes `.cg-stage` inset) | [CanvasArea.tsx:158](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx) → `preview.load({frameOffset})` → [preview.ts `#buildHtml`](../../../apps/designer/src/platform/preview.ts) `.cg-stage { top/left }` | offset          | **Critical:** baked at load, recreated unchanged on scene-replace. Must update **live** (see §4/§9). |
| 2   | iframe **scene-replace** (live drag re-render)     | [CanvasArea.tsx:174–201](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx)                                                                                                                                  | scene only      | carry the new offset in the message so the iframe re-insets `.cg-stage`.                             |
| 3   | `centerFrameInView` (fit/⛶/open)                   | [:390–402](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx) (`pasteboardLayout(sc.resolution).frame` @ :395)                                                                                               | offset          | use content-aware offset so the **frame** is centered (not the grown stage).                         |
| 4   | `fitToViewport` (zoom from FRAME)                  | [:408–426](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx) (`fitZoom(…, resolution …)` @ :413)                                                                                                            | resolution only | **unchanged** — fit must keep fitting the FRAME, never the grown extent.                             |
| 5   | `measure` → `rulerOrigin`                          | [:449–468](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx) (`pasteboardLayout(sc.resolution).frame` @ :454)                                                                                               | offset          | use content-aware offset so rulers/guides stay aligned.                                              |
| 6   | `extent` (stage + iframe size)                     | [:498–499](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx)                                                                                                                                                | extent          | content-aware.                                                                                       |
| 7   | `frameOffset` (render-scope)                       | [:500](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx)                                                                                                                                                    | offset          | content-aware (feeds 8/10/11).                                                                       |
| 8   | `sceneFromClient` (ruler-drag guides)              | [:516–526](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx) (offset @ :523)                                                                                                                                | offset          | tracks via `frameOffset` — OK once #7 is content-aware.                                              |
| 9   | stage inline size                                  | [:619–620](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx)                                                                                                                                                | extent          | content-aware.                                                                                       |
| 10  | iframe inline size                                 | [:636–637](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx)                                                                                                                                                | extent          | content-aware.                                                                                       |
| 11  | `<CanvasOverlay frameOffset>`                      | [:653](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx)                                                                                                                                                    | offset          | content-aware (frame box + `viewportToScene`, §7).                                                   |
| 12  | `CanvasOverlay` frame box + `viewportToScene`      | [CanvasOverlay.tsx](../../../apps/designer/src/renderer/features/canvas/CanvasOverlay.tsx) (frame-origin box at `frameOffset × scale`; `viewportToScene` reads its live rect)                                                 | offset prop     | tracks automatically via the prop + live rect — once #11 is content-aware.                           |

**New seam introduced by grow-to-fit (does not exist today):**

- **(A) Live `.cg-stage` inset update** — consumer #1 bakes the inset into the srcDoc and #2's
  `createRuntime` recreates `.cg-stage` with the same static rule, so the inset is **never** updated
  after load. A movable offset REQUIRES a live update path (CSS variable + postMessage; §4/§9).
- **(B) Origin-shift scroll compensation** — when the offset shifts (content grows left/up), the
  visible content must be held stationary (§5). New `useLayoutEffect`, no analogue today except the
  zoom-anchor effect ([:360–370](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx)).

`pasteboardLayout` is **also** consumed by the unit tests
([pasteboard.test.ts](../../../apps/designer/tests/pasteboard.test.ts)) — they pin the symmetric
`{3840,2160,frame:{960,540}}` result and must be updated when the signature gains a content arg.

**Out of scope (stays fixed):** the broadcast modal + export use `frameOffset = {0,0}` (non-authoring)
and the Phase-A `dropFullyOffFrame` filter — content-aware extent is **authoring-canvas only** and
does not touch export/playout.

---

## 2. BBOX SOURCE — reuse the existing scene-AABB machinery

The exact machinery already exists in
[state/off-frame.ts](../../../apps/designer/src/renderer/state/off-frame.ts) (Phase A):

- `localToParent(t, lx, ly)` — maps an element-local corner through `Scale·Rotate-about-anchor` +
  translate into the parent space (mirror of `geometry.localToScene`).
- `frameAabb(el, ancestors)` — folds the **4 corners** outward through the static ancestor container
  transforms → a frame-space `{minX,minY,maxX,maxY}`.

The overlay computes the same boxes for hit-testing using **current-frame** transforms:
`allElementsAtFrame = allElements.map(el => ({...el, transform: effectiveTransformAt(el, currentFrame)}))`
([CanvasOverlay.tsx](../../../apps/designer/src/renderer/features/canvas/CanvasOverlay.tsx), via
`timeline/keyframe-helpers.effectiveTransformAt`).

**Recommended `contentBounds(doc, currentFrame)`** (new pure helper, sibling of `frameAabb`):

- Iterate the active composition doc's `layers[].children` (the same set the overlay hit-tests and
  the runtime renders).
- For each element, AABB = 4 corners through `localToParent(effectiveTransformAt(el, currentFrame))`,
  folding ancestor transforms for nested content (reuse `frameAabb`'s corner-folding but feed
  **current-frame** transforms at each level, not static `el.transform`).
- Union all AABBs → scene-coord `{minX,minY,maxX,maxY}`; empty doc → `{0,0,W,H}` (the frame).

**Current-frame vs static — recommend CURRENT-FRAME** (what is actually rendered/visible), per the
brief. Justification: the iframe clips what is _visible_, so the extent must match the _visible_ boxes.
**Timeline-scrub implication (call out):** an animated shape that flies off-frame only at some frames
will **grow the extent at those frames** and shrink back (never below the 2× floor) as the playhead
moves — the dark area "breathes" during scrub. Two ways to handle, pick at sign-off:

- **(2a) Current-frame only (recommended, simplest):** extent follows the playhead. Combined with §5
  scroll-comp the frame stays put, so the breathing is just dark margin growing/shrinking off-screen
  — usually invisible, but a fast off-frame keyframe could cause visible extent churn while scrubbing.
- **(2b) Timeline-union:** AABB over current-frame **plus** every keyframe value of the geometry
  tracks (`off-frame.ts:GEOMETRY_TRACKS`) → a **stable** extent that already accommodates the whole
  animation. More compute; no scrub churn. Recommend deferring (2b) unless (2a) churn proves jarring.

**Nested composition instances (CONFIRMED — no off-frame gap):** a composition instance is one
element with its own `transform` box; its child elements live in the **child comp's** coord space.
v1 bounds **only the instance's own box** (Q3 — matches the overlay, which treats an instance as a
unit). This is **not a gap**: `scene-builder.buildComposition`
([scene-builder.ts:161–166](../../../packages/template-runtime/src/scene-builder.ts)) renders an
instance as a box with `el.style.overflow = 'hidden'`, so a nested child that overflows the instance
box is **clipped at the instance box** at render time — it is never visible on the pasteboard.
Bounding the instance's own box therefore matches exactly what is rendered/visible (the same
invariant the whole extent rests on: the extent contains what is visible). A child cannot today be
selected/dragged as an individual anyway. (If a future change lets instances paint outside their box,
this becomes a real gap to revisit.)

---

## 3. NEW EXTENT / OFFSET MATH

Notation (per axis; X shown, Y analogous). `W` = `resolution.width`;
`marginX = round(W × PASTEBOARD_MARGIN_RATIO)` (the **unchanged** base margin). Content AABB in
**scene** coords (scene 0,0 = frame top-left): `cMinX, cMaxX`.

Union the content box **with the frame** so the floor is intrinsic, then add the margin:

```
loX = min(0, cMinX)            // ≤ 0   (frame-left unioned with content-left)
hiX = max(W, cMaxX)            // ≥ W   (frame-right unioned with content-right)

leftBoundary  = loX − marginX                 // ≤ −marginX
rightBoundary = hiX + marginX                 // ≥ W + marginX

frameOffset.x = −leftBoundary = marginX − loX            // ≥ marginX
extent.width  = rightBoundary − leftBoundary
              = (hiX − loX) + 2·marginX                  // ≥ W + 2·marginX  (= today's 2× floor)
```

Because `loX ≤ 0 ≤ … ≤ W ≤ hiX`, with no off-frame content `loX=0, hiX=W` →
`frameOffset.x = marginX`, `extent.width = W + 2·marginX` — **identical to today** (the 2× floor is
exactly the no-off-frame case; an explicit `Math.max(extent, 2× extent)` is redundant but cheap
belt-and-suspenders). `Math.round` all outputs (today's contract).

**Worked examples** (1920×1080 → `marginX=960, marginY=540`; default rect 320×120):

- **Off-left**, shape at scene x ∈ [−2000,−1680]: `cMinX=−2000` → `loX=−2000` →
  `frameOffset.x = 960 − (−2000) = 2960`; `hiX=1920` → `extent.width = (1920−(−2000)) + 1920 = 5840`.
  The shape's left edge lands at iframe x `= frameOffset.x + cMinX = 2960 + (−2000) = 960` (a full
  `marginX` of dark room to its left). _Today this shape is clipped — it sits beyond the fixed 3840._
- **Off-right + off-bottom**, shape at x ∈ [3000,3320], y ∈ [2000,2120]:
  `hiX=3320` → `extent.width = (3320−0) + 1920 = 5240`, `frameOffset.x = 960` (no left growth);
  `hiY=2120` → `extent.height = (2120−0) + 1080 = 3200`, `frameOffset.y = 540`. Right/bottom growth
  needs **no** offset shift (origin only moves for left/up growth) → **no** scroll-comp.

**Open question (grow threshold):** the formula above grows the moment content crosses an edge
(`cMinX<0` or `cMaxX>W`), giving every off-frame shape a full `marginX` of room. This shifts the
origin even for a shape only slightly off the left edge (already visible within today's 960 margin) —
harmless visually (§5 holds content stationary) but it re-sizes the iframe on small off-frame drags.
Alternative: only grow once content exceeds the **base** boundary (`cMinX < −marginX`), i.e.
`frameOffset.x = max(marginX, −cMinX + EXTRA)` with a small `EXTRA` (e.g. 80). Recommend the simple
"union with frame + full margin" (consistent margins, churn hidden by §5); confirm at sign-off.

---

## 4. DRAG RENDERING PATH — live re-render confirmed → recommend LIVE-GROW

**The iframe re-renders LIVE during a drag.** `beginDrag`
([CanvasOverlay.tsx](../../../apps/designer/src/renderer/features/canvas/CanvasOverlay.tsx)) calls
`designerStore.commitAnimatable(id, 'position.x/y', …)` on every pointer-move → the store's `scene`
updates → the `scene` prop changes → the **scene-replace** effect
([CanvasArea.tsx:174–201](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx))
posts `scene-replace` to the iframe (rAF-throttled, coalesced to ≤1/frame) → the runtime
`remove()`+`createRuntime(scene)` re-renders the shape at its new position. The overlay gizmo tracks
in lockstep (same store update → overlay re-render). So a dragged shape **moves live** in both layers.

**Recommendation: LIVE-GROW** (recompute extent/offset from `scene` every render).

- The iframe already re-renders per drag-move, so deriving `extent`/`frameOffset` from `scene` in the
  same render adds only an AABB walk + two inline size writes; the scroll-comp (§5) is one
  `scrollLeft/Top` write in a layout effect.
- **Settle-on-commit is rejected:** with a fixed extent until drop, a shape dragged past the 2× extent
  would **clip mid-drag** (leave the iframe) and only reappear on release — the exact bug we are
  fixing, just deferred to mid-gesture. Live-grow keeps it visible throughout.
- Cost/risk to validate: the iframe **element** resizes every coalesced move (forces reflow) on top of
  the runtime re-render — measure drag smoothness with a far-off-frame shape (§9 risks). The rAF
  throttle on scene-replace already bounds this to ≤1/frame.

**Live `.cg-stage` inset (seam A):** because `createRuntime` recreates `.cg-stage` from a **static**
CSS rule, the inset must be driven by a **CSS variable** the rule reads, updated via postMessage:

- `#buildHtml` authoring CSS → `.cg-stage { top: var(--cg-oy, ${oy}px); left: var(--cg-ox, ${ox}px) }`.
- Iframe inline script sets `document.documentElement.style.setProperty('--cg-ox'/'--cg-oy', …)` on a
  new message (or fold `frameOffset` into the existing `scene-replace` payload so it rides the same
  rAF-coalesced channel). The variable survives `.cg-stage` recreation, so no iframe reload (no flash).

---

## 5. SCROLL-COMPENSATION SEAM (origin shift) — and how it composes with zoom-anchor

When `frameOffset` grows (content extended **left/up**), scene (0,0) moves **right/down** by
`Δoffset × zoom` in the stage/iframe; the visible content would jump unless scroll compensates. Same
principle as `geometry.zoomAnchorScroll`.

**Where it recomputes:** `extent`/`frameOffset` are derived in the render body
([:498–500](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx)), so they change in
the same commit as the scene update.

**Where to compensate:** a **new `useLayoutEffect` keyed on `[frameOffset.x, frameOffset.y]`** (runs
post-layout, pre-paint, mirroring the zoom-anchor effect):

```
const Δx = frameOffset.x − prevOffsetRef.current.x   // scene px
const Δy = frameOffset.y − prevOffsetRef.current.y
outer.scrollLeft += Δx × zoom                         // hold visible content stationary
outer.scrollTop  += Δy × zoom
prevOffsetRef.current = frameOffset
```

Only **left/up** growth changes the offset (Δ>0); right/bottom growth leaves the offset and needs no
comp. `prevOffsetRef` is **reset on `sceneId` change** (a project/comp switch resets the offset to the
new scene's value — fit/center, not comp, should place it; §6).

**Composition with the zoom-anchor effect — independent by KEY:**

- Zoom-anchor effect keys on `[zoom]` and no-ops unless a **zoom gesture** stashed `pendingZoomAnchor`.
- Offset-comp effect keys on `[frameOffset.x, frameOffset.y]`.
- A **zoom** changes `zoom` but **not** the content → `frameOffset` is unchanged → only the
  zoom-anchor effect runs. A **drag** changes content → `frameOffset` may change but **not** `zoom` →
  only the offset-comp effect runs. They are driven by disjoint gestures, so they never fight.
- The one co-fire is **fit-on-open** (sets `zoom` and the scene supplies an offset): the zoom-anchor
  effect no-ops (no stashed anchor) and the offset-comp is neutralised by resetting `prevOffsetRef` on
  `sceneId` so its Δ is 0 — `centerFrameInView` then owns the scroll.
- Zoom-anchor reads the **live** stage rect after relayout, so it is already robust to whatever the
  current offset is; it only needs the offset to be **stable during the zoom gesture**, which it is
  (zoom does not move shapes).

---

## 6. FIT/CENTER + ZOOM-ANCHOR INTERACTION

- `fitToViewport` ([:413](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx)) feeds
  `fitZoom` the **resolution** (frame) — **unchanged**, so "fit on open / ⛶" still fits the **FRAME**,
  never the grown extent. (Fitting the grown extent would shrink the frame whenever content is parked
  far — undesirable.)
- `centerFrameInView` ([:395](../../../apps/designer/src/renderer/features/canvas/CanvasArea.tsx))
  must swap `pasteboardLayout(sc.resolution).frame` for the **content-aware** offset so it centers the
  frame at its real inset. Its math (`frameLeft = stageLeft + offset×z`, then center the frame) is
  otherwise unchanged.
- **Zoom-anchor's stable-origin assumption coexists** because the origin only moves on **content**
  changes, never on zoom; during a zoom gesture the offset is constant, so the anchor math (capture
  scene point pre-zoom, restore post-zoom) is unaffected. On `sceneId`-stable content edits the
  offset-comp (§5) — not zoom-anchor — handles the origin shift.

---

## 7. OVERLAY MAPPING under a shifting origin

`CanvasOverlay` already takes `frameOffset` as a prop and:

- positions a **frame-origin box** at `top/left = frameOffset.{y,x} × scale` (holds the gizmos +
  `canvas-surface` hook; scene (0,0) = its top-left);
- `viewportToScene` reads that box's **live** `getBoundingClientRect()`;
- the pointer/hit-test **layer** is `inset:0` of the stage, so it covers the whole (growing) pasteboard.

So the overlay tracks a shifting origin **automatically**, provided the **content-aware** offset is
passed (seam #11) — the frame box re-renders at the new inset and `viewportToScene` reads the new rect.
The only other origin consumer is `rulerOrigin` in `measure` (seam #5/§1), which must use the
content-aware offset; it already re-runs on scroll/zoom/resize (and the §5 scroll-comp triggers a
`scroll` event → `measure` re-fires), so rulers/guides realign. Confirm `measure`'s dep array still
captures offset changes (today `[zoom, sceneId, html]` — an offset change without a zoom/scroll would
need the scroll-comp's scroll write to re-fire `measure`, which it does; otherwise add the offset to
deps).

---

## 8. PERFORMANCE — giant-iframe edge case

Extent is **content-driven**, so the iframe is only as large as **real** content + margin (empty dark
margin is free to render). The pathological case is a shape parked absurdly far (e.g. x = 100 000),
making the iframe element ~100 000 px wide with a matching `device-width` layout viewport — large DOM
layout cost + memory. **Document as acceptable for v1, no virtualization.** Optional cheap guard
(flag at sign-off): clamp the extent to a sane maximum (e.g. N× the frame) and accept clip beyond it —
keeps a runaway drag from melting layout while still covering realistic staging.

---

## 9. RECOMMENDATION, RISKS, TEST PLAN

### Recommended approach (end-to-end)

1. **`contentBounds(doc, currentFrame)`** — new pure helper (sibling of `off-frame.frameAabb`):
   union of every active-comp top-level element's 4-corner AABB at `effectiveTransformAt(el, frame)`,
   in scene coords; empty → frame box. Current-frame positions (2a); instance = its own box (v1).
2. **`pasteboardLayout(resolution, contentBBox?)`** — extend (keep back-compat default = frame box) to
   apply the §3 union-with-frame + margin formula (2× floor intrinsic). Returns `{width,height,frame}`.
3. **Thread the content-aware `extent`/`frameOffset` through the whole §1 seam** — load offset,
   scene-replace payload, `centerFrameInView`, `measure`, render extent, overlay prop. `fitToViewport`
   stays resolution-based.
4. **Live `.cg-stage` inset (seam A)** — CSS variable in `#buildHtml` + a postMessage (folded into
   `scene-replace`) that sets `--cg-ox/--cg-oy`, so the iframe re-insets without a reload.
5. **Origin-shift scroll-comp (seam B)** — new `useLayoutEffect` keyed on `frameOffset`, `prevOffsetRef`
   reset on `sceneId`, independent of the `[zoom]` zoom-anchor effect.
6. **Live-grow** (recompute per drag-move) — not settle-on-commit.

### Risks

- **Stale iframe inset (highest):** if seam A is missed, the iframe frame and the overlay frame
  desync the instant content grows the offset. Must land with the offset threading.
- **Scroll-comp vs fit/center on open** — mitigated by resetting `prevOffsetRef` on `sceneId`.
- **Scroll-comp vs zoom-anchor** — mitigated by disjoint keys (`frameOffset` vs `zoom`); verify no
  case changes both in one commit except fit-on-open (handled).
- **Drag perf** — iframe element resize + runtime re-render every coalesced move; validate smoothness
  with a far-off-frame drag; rAF throttle bounds it.
- **Scrub churn (2a)** — animated off-frame keyframes resize the extent during scrub; acceptable, or
  upgrade to timeline-union (2b) if jarring.
- **Unit-test contract** — `pasteboard.test.ts` pins the fixed `pasteboardLayout` result; update for
  the new signature (empty content → unchanged; off-frame content → grown).

### Test plan

**E2E (new):** park a shape **FAR beyond the old 2× extent on BOTH sides** in two cases —
(a) off-left + off-top (large negative coords), (b) off-right + off-bottom — and assert each stays
**VISIBLE** (`[data-cg-element-id]` attached, non-zero box, within the scrolled viewport) and
**selectable** (gizmo shown; `elementFromPoint` at its centre is its own subtree).

**Regression guards (must stay green):**

- The dark area **never shrinks below 2×**: with no off-frame content, surround/extent equal today's
  (`pasteboardLayout(resolution)` floor); unit-assert the floor + an off-frame-grows case.
- **Fit + center on open** still fits the **FRAME** (frame centered in viewport; zoom from frame
  bounds), even with far-parked content present.
- **Cursor-anchored zoom** still holds (point under cursor stays put) with a grown/shifted origin.
- **Rulers/guides stay aligned** under a shifted origin (ruler 0 at frame top-left after the offset
  grows; guide drawn at the right scene coord).
- **Two-tone** (`#161927` surround / `#080a10` page), off-frame visibility, modal blanks-until-play
  (D-087), export drops off-frame (Phase A) — all unaffected (authoring-only change).

### Open questions for sign-off

1. **Grow threshold (§3):** union-with-frame + full margin (grows on any edge cross, simplest) vs a
   base-boundary threshold with small `EXTRA` (fewer iframe resizes on small off-frame drags)?
2. **Scrub model (§2):** current-frame only (2a, recommended) vs timeline-union (2b, stable, costlier)?
3. **Nested composition instances (§2):** v1 bounds only the instance box — accept the gap, or compose
   through the instance transform now?
4. **Perf cap (§8):** add a max-extent clamp now, or accept unbounded for v1?
5. **`measure` deps (§7):** rely on the scroll-comp's `scroll` event to re-fire `measure`, or add
   `frameOffset` to its dep array explicitly?
