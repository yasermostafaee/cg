# Pen tool + editable bézier `path` element (D-109)

## Why

Rectangle and ellipse can't express arbitrary outlines; the owner wants Loopic-style custom vector
shapes. A `path` element — each anchor carrying a stable id — is also the foundation D-110 (path
morphing) builds on. This item is the element + the Pen tool + full editing; per-point keyframe
morphing is explicitly D-110 (out of scope).

## What Changes

- **Schema (`@cg/shared-schema`)** — a new `PathElementSchema` (`type: 'path'`), distinct from the
  legacy `shape: 'path'` + `pathData` string. Shape: `points: AnchorPoint[]` (min 2), `closed:
boolean`, optional `fill`, optional `stroke` (only the stroke part of the D-042 box mixin — a
  freeform path has no border radius). `AnchorPoint = { id, x, y, in?, out?, smooth }`; `in`/`out` are
  handle DELTAS from the anchor; each `id` is a stable nanoid (D-110's reconcile key). A shared
  `pathBBox(points)` helper.
- **Runtime (`@cg/template-runtime`)** — render a path as `<div><svg><path d></svg></div>`: the `d` is
  built from the points (`M`, cubic `C` from each anchor's `out` to the next anchor's `in`, `Z` when
  closed); a CLOSED path fills + strokes, an OPEN path strokes only (`fill: none`). The SVG `viewBox`
  is the points' bbox with `preserveAspectRatio: none`, so the B-022 gizmo resizes by changing
  `transform.size` (the viewBox rescales) WITHOUT re-baking points. Transform / opacity / filter
  animate generically; fill / stroke animate on the inner `<path>` (no new animation-engine work —
  point morphing stays D-110).
- **Designer (`@cg/designer`)** — a Pen tool in the canvas toolbar + a pointer state machine (click =
  corner, click-drag = smooth with mirrored handles, click-first-anchor = close, Enter/Esc/dbl-click =
  finish open); a path edit overlay (drag anchors / handles, Alt breaks a mirrored pair, click a
  segment to insert, Delete removes — re-stitching, deleting the element below 2 anchors); a hit-test
  extension (point-in-polygon for a closed interior + distance-to-stroke); a Path inspector (fill,
  reused D-042 stroke, a closed/open toggle, a read-only anchor count). The B-022 gizmo is reused
  unchanged (size = points bbox).

## Capabilities

- `designer-path-element` (ADDED): the path element + pen-draw + edit + render + hit-test/gizmo.

## Impact

- `@cg/shared-schema` (PathElementSchema + AnchorPointSchema + pathBBox + union), `@cg/template-runtime`
  (buildPath + d-string + path stroke/fill appliers), `@cg/designer` (tool, pen-draw, PathEditor,
  hit-test, element-defaults, field-registry, StyleSection, timeline color). Preview == export (one
  runtime). No migration (a new optional element kind).
- Tests: schema round-trip (ids preserved, open/closed), runtime d-string + render unit, designer
  hit-test/factory unit, a pen-draw E2E. Engine docs: template-runtime + canvas READMEs.

## Out of scope (v1)

Per-point morphing / path keyframes (**D-110**); boolean ops; variable-width stroke; importing SVG
paths; converting rect/ellipse to paths; gradient path fills (the editor authors a SOLID fill — a
stored gradient degrades to its first stop in the SVG render).
