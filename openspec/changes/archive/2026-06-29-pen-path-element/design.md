# Design — Pen tool + editable bézier path element (D-109)

## Capability: a new `designer-path-element` (not folded into `designer-shapes`)

The path is a distinct element kind (`type: 'path'`) with its own draw tool, edit overlay, hit-test,
and inspector — a self-contained capability reads clearer than threading `## MODIFIED` deltas through
`designer-shapes`. (The PRD allowed either; this is the smaller, clearer diff.)

## Schema: a distinct `type: 'path'`, stroke inlined (no border radius)

A `shape: 'path'` + `pathData: string` variant already existed (a static d-string shape); D-109's
editable path is a SEPARATE `type: 'path'` element with structured `points` so the editor + D-110 can
manipulate anchors. Only `stroke` (not the whole `BoxStyleSchema`) is inlined — a freeform path has no
border radius. `in`/`out` handles are DELTAS from the anchor (stay correct under transform; clean
morph target for D-110). `id` is a stable nanoid the editor mints (D-110 matches anchors by it).
`points` has `.min(2)` — removing below 2 deletes the element, so a valid path always has ≥ 2.

## Local frame: points are 0-origin, `transform.size` = bbox, viewBox rescales on resize

Points live in a 0-origin local frame; `transform.position` is the bbox top-left and `transform.size`
the bbox. The runtime SVG uses `viewBox = pathBBox(points)` + `preserveAspectRatio: none`, so the box
fills with the outline. This is the key decision that lets the **B-022 gizmo be reused UNCHANGED**:
resizing changes `transform.size`, the viewBox rescales the outline (independent x/y = scaleX/scaleY),
and the points are NOT re-baked. On point edits the designer re-normalizes (shift points + position so
the bbox is 0-origin again, scene-stable) and updates `size` — keeping points decoupled from position
(move = position only; edit = points only). Hit-test projects the click into the same display space,
so a resized path still hits its real outline (point-in-polygon closed + distance-to-stroke).

## Animation: generic transform/opacity/filter; fill/stroke on the inner `<path>`

Transform / opacity / filter apply to the wrapper (generic appliers — free). Fill (closed only) and
stroke animate by writing the inner `<path>`'s attributes — a small applier branch, NOT the
animation-engine morphing work that D-110 owns. The D-051 field registry marks `fill.color` +
`stroke.*` keyframe-able for `path` (same as shape), so the path's timeline rows + inspector diamonds
match a shape's.

## Pen interaction + edit overlay

The pen is a module-level pointer state machine (like the drag controllers): click = corner, drag =
smooth (handles mirror the drag), click-first-anchor = close, Enter/Esc/double-click = finish open.
The draft renders live as the real element once it has ≥ 2 anchors (preview == export throughout).
The edit overlay (an SVG of anchor squares + handle dots) shows only with the SELECT tool, so its dots
don't intercept the pen's close-click. Delete uses a capture-phase listener to pre-empt the global
"delete element" shortcut while an anchor is active.

## Out of scope (recorded)

Per-point morphing / path keyframes (**D-110** — the registry gets a path descriptor + the applier
interpolates points there); boolean ops; variable-width stroke; SVG import; rect/ellipse→path convert;
**gradient path fills** (the inspector authors a solid fill; a stored gradient degrades to its first
stop in the SVG `fill` — full SVG-gradient defs are a later enhancement). Overlay handles do not
reflect element ROTATION (a v1 limitation).
