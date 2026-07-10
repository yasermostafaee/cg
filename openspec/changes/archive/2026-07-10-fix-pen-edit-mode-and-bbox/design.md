# Design — fix-pen-edit-mode-and-bbox (B-058…B-063 / D-124)

## OWNER PIVOT (mid-change, 2026-07-10): size == visualBBox model + four more issues

The owner folded four more issues in and DECIDED THE MODEL: resizing a path's W/H SHALL actually
scale the anchor coordinates (points move, like a rectangle) — converge on **"points fill the
real bbox, `transform.size` == visual bbox"**, with ONE migration covering this and Item 3.
This SUPERSEDES the first-build option (b) display-mapping layer below (kept for the record;
its `path-bounds.ts` display↔stored mapping and the Gizmo/Inspector/off-frame special cases are
REMOVED again in favor of the model — the invariant makes every generic `transform.size` consumer
just work):

- **New stored convention**: a path's points live with their VISUAL (curve-aware) bbox at local
  (0,0) and `transform.size` == that bbox's extents. `normalizePathPoints` re-anchors against
  `pathVisualBBox` (was: anchors bbox). The runtime viewBox becomes `pathVisualBBox(points)`
  (same `max(,1)` clamp) → scale 1 for conforming content. `hitsPath`'s display mapping mirrors
  it.
- **Static resize BAKES the points**: `writeStaticAnimatable('size.w'|'size.h')` for a path
  scales all point coords + handles by `v / size.axis` and writes points+size together
  (idempotent per call — each gizmo-drag tick scales current→next). `size.*` KEYFRAMES stay as
  today (a multiplicative render stretch on top of the static geometry — animation semantics
  unchanged). This kills the resize-then-edit snap-back (B-062): after a resize,
  `size == bbox(points)` holds, so an anchor drag's normalize no longer resets it.
- **ONE migration** (`migratePathGeometry`, pure, in `@cg/shared-schema`): a path whose points'
  visual bbox is NOT (0,0,size) is legacy — bake `f = size/max(anchorBBox,1)` into the points
  (coords + handles, per axis), re-anchor to the new visual bbox, shift `position` by the visual
  offset, set `size` to the visual extents, and compensate the rotation pivot (the anchor is a
  box FRACTION — keep the pivot's scene point fixed under static rotation). Applied at: Designer
  scene load (`setScene`, beside `ensureCompositions` — the box-radius precedent) and DEFENSIVELY
  in the runtime's `buildPath` (so legacy `.vcg` packages render pixel-identically without
  rewriting the package — this addresses the integrity/signing blocker that killed the old
  option (a); the migration is deterministic and in-memory). Legacy paths with size keyframes:
  track values are scaled by the constant per-axis ratio (exact); animated-rotation + legacy
  resize + curves is documented as a known corner (compensation is static-rotation-exact).
- **Issue A (B-061, rotation)**: `PathEditor.screen()` maps point→scene through the element's
  full `Scale·Rotate`-about-anchor transform (reuse `geometry.localToScene`); anchor/handle drag
  deltas run the inverse (un-rotate by −rotation, un-scale) so dragging tracks a rotated shape.
  Anchors, handle dots, segment hit-curves, and the add affordance all use the same mapping.
- **Issue C (B-063, affordance off the real edge)**: the segment hit-lines become per-segment
  cubic `<path>`s built from the SAME control points the runtime renders, mapped through the
  rotated `screen()` (control points transform affinely) — the add affordance hugs the true
  curved, rotated outline. Segments are now ALWAYS pointer-interactive: a plain left press
  returns WITHOUT stopPropagation (falls through to normal select/drag), Ctrl/Cmd press inserts
  (Item 2 unchanged), and right-press opens the add menu (Issue D). The `copy` cursor still
  appears only while the modifier is held.
- **Issue D (folded into D-124, add menu)**: right-clicking a SEGMENT (not an anchor) in edit
  mode opens the shared context menu with **Add point** (corner) and **Add curve point** (smooth)
  at the nearest point on the curve under the cursor (nearest of 32 samples of the cubic);
  "Add curve point" seeds tangent-aligned mirrored handles (curve derivative direction at t,
  magnitude chord/6 — pull-out-able afterwards). Routed through the same insert path (normalize +
  one undo entry). Disambiguation: on-anchor right-click still = Delete point; pen-drawing
  right-click still = cancel (B-060) — three contexts, structurally disjoint.
- **B-059's user-visible fix is unchanged** (selection box + Inspector W/H enclose the curve) —
  it now falls out of the model instead of a mapping layer.

Numbering: Issue A = B-061, Issue B = B-062, Issue C = B-063 (all filed); Issue D folds into
D-124.

### Owner re-verify round (2026-07-11): rotated-drag drift — render-neutral normalize

Owner-found during verification of the set above: on a ROTATED path, dragging ONE anchor made
every OTHER anchor shift slightly per move tick. Probe confirmed the diagnosed mechanism exactly
(triangle at 30°, one 8-px bbox-growing tick): the per-edit re-normalize keeps `size == bbox`,
which moves the rotation pivot `anchor⊙size` — pivot (270,155) → (270,159) — and every unchanged
anchor re-projected **2.07 scene px**. Position hadn't even changed (`vmin` stayed 0); the SIZE
change alone moves the pivot, so the drift is invisible at rotation 0 and appears only rotated.

**Decision — reconciliation stays CONTINUOUS (every tick), not deferred to gesture end.**
Deferring bbox/size reconciliation to `markHistoryBoundary` cannot work under this model: the
runtime stretches `viewBox(visual bbox)` onto `size`, so any mid-drag mismatch between the live
points' bbox and `size` rescales the WHOLE shape each tick (worse than the drift). Instead the
re-normalize itself is made **render-neutral under the full transform**: the renderer maps
`local → position + A + M·(local − A)` (`A = anchor⊙size`, `M = Scale·Rotate` — `localToScene`),
and solving "every unchanged point keeps its scene spot" across the reframe gives

```
position' = position + (I − M)(A − A') + M·vmin
```

(`A' = anchor⊙size'`, `vmin` = the new bbox min in the pre-edit point frame). At rotation 0 /
scale 1 this reduces EXACTLY to the previous `position += vmin`, so pen drawing and every
rotation-0 flow are bit-identical. Implemented inside `normalizePathPoints` (the single seam all
PathEditor edits — anchor drag, handle drag, insert, delete — funnel through via `applyPoints`);
gizmo/Inspector resizes are intentional box changes (bake via `bakePathSize`) and correctly keep
plain-resize semantics. There is no gesture-start snapshot and no mid-drag special state: the
frame is stable because every reframe is exactly render-neutral, which also removes any
single-frame jump at gesture end. Regression: `tests/path-rotated-edit.test.ts` (30°; 90° +
non-uniform scale over multiple ticks; rotated handle drag; the rotation-0 identity limit) + the
E2E drift assertion in `pen-edit-mode.spec.ts` (drag one anchor of the rotated triangle, others
stationary within 1 px).

---

# First-build design (superseded where noted above)

Recon ran as a four-reader parallel sweep over the code on current main (post D-123/#275,
renumber/#276); findings below are file:line-verified.

## Item 3 (B-059) — curve-aware bounds: option (b), display-level override. (a) is disqualified.

**Why not (a) global curve-aware `pathBBox` + migration:** the stored `transform.size/position`
of every existing path is baked against the anchors-bbox convention (`normalizePathPoints`
writes it; the runtime viewBox at `scene-builder.ts:1093` + `preserveAspectRatio:none` reads it).
Changing `pathBBox` globally re-scales/shifts every legacy path. A Designer load-time re-bake has
precedent (`setScene` → `ensureCompositions(normalizeKeyframeIds(...))`), BUT: (1) **`.vcg`
packages cannot be migrated** — `template.json` is rendered by the CURRENT `@cg/template-runtime`
and `manifest.integrity`/signing hash the packaged files, so rewriting is impossible and the
Runtime would need a second in-memory migration surface; (2) the re-bake is exact ONLY for
static, unrotated transforms — `position` keyframes need a time-varying offset when `size` is
also animated (not expressible with independent tracks), and rotation/scale pivots (the anchor is
a FRACTION of the box) move when the box grows. Rejected.

**Chosen (b): `pathVisualBBox` + a display-box override in the editor surfaces**, the exact
pattern the Gizmo already uses for auto-sized text (`Gizmo.tsx:150-157` overrides `t.size/position`
with a measured display box). Pieces:

- `pathVisualBBox(points)` in `@cg/shared-schema` beside `pathBBox`: the union of each segment's
  EXACT cubic extents — endpoints plus the roots of the cubic's derivative per axis (quadratic
  formula; linear fallback when the t² coefficient ~0), using the same control-point convention
  the runtime renders (`c1 = a + a.out`, `c2 = b + b.in`, straight when both absent, closing
  segment when `closed`). Exact extrema over flattening: cheap (≤ 2 roots per axis per segment),
  precise, and unit-testable against known curves.
- Pure mapping helpers in the canvas feature (`path-bounds.ts`): the display box in scene coords
  is `position + (visualMin − anchorMin)·f`, extent `visualExtent·f`, with
  `f = size / max(anchorExtent, 1)` per axis (the SAME clamp the viewBox/hit-test use); the
  inverse (display box → stored size/position) is closed-form because the visual/anchor ratio
  depends only on the points: `size' = dispExtent·anchorExtent/visualExtent`,
  `position' = dispPos − (visualMin − anchorMin)·size'/anchorExtent`.
- **Gizmo**: paths join the auto-text branch — the frame/handles trace the DISPLAY box; resize
  maps the dragged display box back through the inverse before `commitAnimatable('size.*')`
  (auto-text disables resize; paths keep it, via the closed-form inverse). Rotation keeps the
  documented v1 imprecision (overlay ignores rotation) — unchanged class of limitation.
- **Inspector W/H**: for paths, display the VISUAL W/H and commit through the inverse (typing a
  height makes the VISIBLE shape that tall). Localized in `TransformSection`'s read/commit for
  `size.*` on path elements.
- **Adjacent defect fixed too**: the off-frame export filter (`state/off-frame.ts` `frameAabb`)
  folds the anchors-box corners, so a path whose anchors sit off-frame but whose bulge is visible
  would be WRONGLY DROPPED from export — it now folds the visual box for paths.
- **Unchanged by design (lockstep verified)**: runtime render, `.vcg`/HTML export bytes,
  `hitsPath` (B-055 mapping mirrors the viewBox), `PathEditor.screen()`, `normalizePathPoints`,
  stored schema — export/round-trip is bit-identical.

## Item 4 + Item 2 (D-124) — point-edit MODE, Ctrl-gated insertion

- **State**: `editingPathId: string | null` beside `editingTextId` (selection slice;
  session-only). Set by double-click on a path (CanvasOverlay `onDoubleClick`, before the
  text/composition branches fall through — paths previously did nothing on dblclick). Cleared by:
  `setSelection` when the new set doesn't contain the id (covers selecting another element and
  deselect), `setActiveComposition`/`openCompositionAndSelect`, scene load, and a tool-change
  effect (mirrors the `endPenSession` wiring) so a stale mode can never collide with the pen.
- **Mount gates**: `PathEditor` now requires `editingPathId === selectedEl.id` (on top of the
  existing cursor-tool/visible/unlocked/no-text-edit/no-bind gates). The **Gizmo hides while a
  path is in edit mode** (same as inline text editing) — point editing is a dedicated mode, and a
  live gizmo's edge/corner hit-zones over the anchors would recreate the B-037 hijack class.
  Single click therefore = selection box only; double click = anchors/handles only.
- **Esc precedence** (the full chain, enforced structurally):
  1. **Anchor context menu** (capture-phase window listener + `stopImmediatePropagation` —
     kills the event before ANY bubble listener; no other actor needs a menu guard).
  2. **Focused editable / inline text edit / bind mode** (existing guards a+b in the CanvasOverlay
     dispatcher).
  3. **Pen branch** (drawing: Esc cancels; idle: Esc → cursor) — unreachable in edit mode
     (cursor-tool-only) and vice versa.
  4. **NEW: exit point-edit mode** — inserted in the same dispatcher between the Escape gate and
     the deselect, with an early return: first Esc exits edit mode (selection KEPT), second Esc
     deselects. No new window listener → no registration-order dependence.
  5. **Deselect.**
- **Empty-pasteboard click**: in the cursor branch's `hit === null` path — if in edit mode, exit
  edit mode only (selection kept, matching Esc); the next empty click deselects as today.
- **Item 2 — Ctrl/Cmd-gated insertion** (in edit mode only, since segments only exist there):
  `PathEditor` tracks the modifier live (window keydown/keyup for Control/Meta + syncing from
  pointer events, so a press that started outside the window stays correct). The segment hit-lines
  render `pointerEvents: 'stroke'` + the `copy` cursor ONLY while the modifier is down — without
  it they are `pointerEvents: 'none'`, so clicks fall through to normal behavior — and
  `insertOnSegment` double-checks `e.ctrlKey || e.metaKey` (macOS Cmd counts; both accepted on
  either platform rather than sniffing). Insert semantics themselves (click = corner, drag =
  smooth, at-release decision, one undo) are B-056/B-057's, unchanged.

## Item 1 (B-058) — menu chrome: extract `ui/ContextMenu.css.ts`, both menus consume it

Recon inventoried SIX hand-rolled context menus (timeline layer, keyframe/TrackRow, assets,
shared library, compositions, toolbar dropdown) with drifted values (radius 0.3 vs 0.25rem,
shadow 8/24 vs 6/18, three item paddings, two danger reds, one hard-coded background, z-index
40→3000) — there is NO shared primitive; the owner's "shared component it builds on" doesn't
exist. Per the design-system rule (shared app-local primitives live in `renderer/ui/`), the
LayerContextMenu's values become canonical in a NEW `ui/ContextMenu.css.ts`
(backdrop/menu/item/itemDisabled/shortcut/divider, z-index 1000), consumed by BOTH
`AnchorContextMenu` (its own css deleted) and `LayerContextMenu` (one-line re-exports; timeline
keeps only its submenu/swatch extras — markup untouched). The anchor menu KEEPS its superior
keyboard/aria layer (focus-first, arrow wrap, capture-owned Esc, `Control` menuitems) — Item 1 is
a chrome change, not a behavior port to Layer's mouse-only divs. The one real trap: `Control
variant="bare"`'s hover selector (specificity 0,4,0) beats a plain `&:hover`, which is why the
D-123 menu hovered gray instead of the cyan tint — the shared `item` hover uses the same selector
text (+ `filter: none`) so the cyan wins on buttons and still applies to Layer's divs.
Owner-visible deltas closed: radius, font size (0.74rem), item padding, cyan hover, z-index,
space-between row layout with a shortcut slot.

## Item 5 (B-060) — right-click cancels an in-progress pen draft

`onContextMenu` on the CanvasOverlay pointer LAYER div (spans the pasteboard; the frame box has
no handlers; the pen feedback SVG is pointer-events:none). Guards: exactly
`tool === 'pen' && isPenDrawing()` → `preventDefault()` (defense in depth — App.tsx's app-wide
suppression already eats the native menu), `cancelPen()` (identical semantics to the drawing-Esc:
leading+trailing history boundaries, created element removed), `setPenPointer(null)`. `contextmenu`
over a button-2 pointerdown because the overlay's pointerdown deliberately ignores non-primary
buttons (nothing can race an anchor placement) and it also covers the keyboard ContextMenu key.
**Disambiguation table (enforced by mount/guard structure, not runtime checks):**

| Context                                              | Right-click means            |
| ---------------------------------------------------- | ---------------------------- |
| Pen tool armed AND drawing                           | cancel the draft             |
| Cursor tool, path in point-edit mode, over an anchor | the Delete-point menu        |
| Anywhere else                                        | today's behavior (no custom) |

The two custom behaviors cannot cross: the anchor menu lives in `PathEditor` (cursor-tool +
edit-mode only) whose `stopPropagation` keeps anchor right-clicks off the layer handler, and the
layer handler requires the pen tool, which unmounts `PathEditor` entirely (B-037 gates).

## Rider — stale bug-number references in code

#276 renumbered designer B-053→B-057 and B-054→B-056 (docs-only; runtime keeps the old numbers).
The code/test references this branch touches anyway are renamed in their own commit:
`pen-draw.ts`, `PathEditor.tsx`, canvas `README.md`, `pen-smooth-placement.test.ts`,
`pen-curve-edit.spec.ts`, `path-tools.test.ts`.

## Out of scope (noted)

- Converging the four OTHER drifted menus onto `ui/ContextMenu.css.ts` (assets, shared library,
  compositions, keyframe) — mechanical follow-up, listed for a future housekeeping item.
- `pathBBox` semantics for storage/runtime — deliberately untouched (see Item 3).
- Overlay rotation fidelity (documented D-109 v1 limitation) — unchanged.
