## Context

M12.0 introduced the keyframe data model
(`Track`/`Keyframe`/`ElementAnimation` in `@cg/shared-schema`) and M12.1 wired
a frame-driven applier in `@cg/template-runtime` that interpolates those
tracks back onto the DOM each rAF tick. The Designer side was deliberately
left to a later milestone — `Scene.frameRange` is stored, but the
Designer has no UI for the operator to set a frame, add a keyframe, or scrub.
The PRD reference screenshots (Loopic Studio) describe a familiar After
Effects-style layout: a frame ruler with a playhead; per-property track rows
on the left, keyframe diamonds along the right.

## Goals / Non-Goals

**Goals:**
- One-click "add keyframe" per animatable property at the current frame.
- Drag-to-move a keyframe along its track.
- Delete the selected keyframe.
- Scrub the playhead and see the canvas reflect the interpolated state.
- Edit the value at a keyframe through the existing Inspector / canvas Gizmo
  (no parallel value editor in the timeline itself for v1).
- Persist into the existing `Element.animation.tracks` field — re-loading a
  saved scene re-shows the same keyframes.

**Non-Goals (deferred):**
- Color tracks (`fill.color`, `text.color`) — the M12 schema supports them but
  the PRD's eight required tracks are all numeric; the data model is flexible
  enough that we can expose color tracks later without spec churn.
- Multi-element timelines — when the selection size ≠ 1, the dock shows an
  empty hint. Multi-select editing is its own UX problem.
- Undo/redo for keyframes specifically — store mutations land alongside the
  existing element mutations; the broader undo/redo work is M-7 territory.
- Bezier handles between keyframes — the schema uses keyword easings only.
- A reactive runtime preview channel — the Canvas iframe already reloads on
  any scene mutation; we'll piggy-back on that for v1 instead of inventing a
  new postMessage path.

## Decisions

- **One docked timeline below the canvas, not a floating window.** Matches
  the Loopic reference screenshots and the existing fixed-layout shell.
  Implemented as a new `gridTemplateRows` slot in `App.tsx`.
- **Custom React/SVG timeline component, no third-party timeline.** The old
  D-006 prototype used `vis-timeline` + Konva. Both are large, DOM-heavy, and
  pull canvas tooling we don't otherwise need. A few hundred lines of plain
  React drawing on a flex/SVG row gives us the eight tracks + ruler + playhead
  the PRD calls out, and it keeps the bundle small.
- **Property set is fixed to the M12 numeric properties.** The PRD lists
  exactly eight properties (positionX/Y, scaleX/Y, rotation, width, height,
  opacity). Mapping table from UI label → `AnimatableProperty` lives in
  `keyframe-helpers.ts`. Color tracks stay out of the UI for v1 but the helper
  is easy to extend.
- **Adding a keyframe reads the current static value** from the selected
  element's `transform`/`opacity`. If a track for that property already
  exists, the new keyframe is inserted sorted by `frame`; if a keyframe
  already exists at that frame, the existing one's value is **overwritten**
  (the "click again to update" behavior every editor of this shape has).
- **Moving a keyframe** swaps the frame index in place and re-sorts the
  track. If two keyframes collide on the same frame after a move, the moved
  one wins and the displaced one is dropped — same as Loopic and AE.
- **Deleting the last keyframe in a track removes the track entry** so the
  element's `animation.tracks` doesn't accumulate empty arrays (the schema's
  `min(1)` constraint forbids them anyway).
- **Track-aware routing for value edits.** Every Inspector / Gizmo / canvas
  drag on the eight animatable properties is routed by `commitAnimatable`:
  if the property has no track yet, it writes the element's static value as
  before; once a track exists (the operator has authored at least one
  keyframe), every subsequent edit lands as a keyframe at the current frame
  — replacing the one at that frame if present, otherwise inserting a new
  one. This is the rule that lets the operator *build the animation by
  dragging*: add the first keyframe by hand, scrub to a new frame, drag —
  and a second keyframe appears with the new value. It matches the PRD's
  worked example. The previous "edit only updates when exactly on a
  keyframe" rule was simpler but did not actually let the operator author
  motion this way.
- **Decouple Designer playhead from the live-preview iframe.** The Canvas
  iframe already auto-plays the scene end-to-end via the runtime's own
  `FrameDriver`, so the operator sees the keyframes they author the moment
  they author them. The Designer's `currentFrame` is therefore the
  **authoring cursor** — the frame at which the next "add keyframe" lands —
  not a synchronized playhead on the preview. Wiring the preview to scrub
  to an arbitrary frame would need a new `scrub-to-frame` action on the
  preview bridge, which is a follow-up. The PRD's screenshots show the same
  pattern (preview keeps playing while you edit).
- **Transport semantics inside the dock:** Play starts a Designer-local
  frame loop driven by `requestAnimationFrame` that advances `currentFrame`
  at `scene.frameRate`, looping at `frameRange.out` back to `frameRange.in`.
  Stop halts the loop and freezes `currentFrame`. Step buttons move ±1.
  This is a small, local loop — no coupling to the preview iframe's own
  driver.

- **Single-click vs double-click on a keyframe diamond.** Single-click is
  lightweight selection only — `setSelectedKeyframe` lights up three
  yellow indicators (the lane diamond, the TrackRow label diamond, and
  the matching diamond on the right Inspector's animatable row) but the
  right panel keeps showing the Element view. The dedicated
  `KeyframeInspector` for editing the point's frame / value / easing
  opens only on an explicit **double-click** (or its "edit" affordance) —
  it sets a separate `keyframeInspectorOpen: boolean` flag so the
  selection state and the inspector mode are decoupled. This matches the
  Loopic reference where single-click is a lightweight gesture and the
  detail panel needs a deliberate gesture to surface; B-002 specifically
  called out that the previous always-switch behaviour belonged on
  double-click.
- **Per-property indicators in the Element Inspector.** Each of the eight
  animatable rows in `TransformSection` carries a small diamond glyph
  that mirrors the matching glyph in the TrackRow label column. The
  shared `keyframeVariantFor` helper computes the variant (empty,
  has-track, at-frame, selected) so the two diamonds stay in sync —
  which is what makes "click a point in the timeline" feel coherent
  across the two panels. Click the indicator to toggle a keyframe at
  the current frame.
- **Ruler is structurally a row that shares the dock's grid.** The dock
  uses a 2-column grid (`[label-col] [lane-col]`) and the ruler row uses
  the same grid — frame 0 sits in the ruler exactly where every track
  row's lane starts, so a keyframe at frame N visually lines up with the
  ruler's "N" tick. The label column carries a "FRAME" caption gutter and
  no ticks.
- **Density + palette pass (B-001).** Inspector and timeline font sizes
  drop from `~0.82rem` to `~0.72rem` with tabular-nums for value columns
  and tighter row padding so the dense data layout in the Loopic reference
  reads correctly. Designer-only theme overrides adopt the bluer Loopic
  chrome (`#272b40`/`#24273d`/`#2e3247`) without touching the shared
  `@cg/ui` chrome — Runtime keeps its existing palette.
- **Loopic-style layout pass (B-001 deeper).** Inspector loses the big
  `ELEMENT — SHAPE` heading + id/name rows; in their place a single
  editable `Key | <name>` row matches the reference. The eight
  animatable rows use single-letter/icon labels (`X` `Y` / `W` `H` /
  `↔` `↕` / `↻` / `%`) inside chip-style cells, with the shared
  KeyframeIndicator at the right edge of each row. Sections
  (`Transform`, `Path style` / `Text style` / `Image`, `Bindings`)
  become collapsible (`CollapseSection`) with chevrons (`▾` / `▸`).
  Timeline switches to a per-element **tree**: every element in the
  scene gets a header row carrying a chevron, name, visibility / lock
  indicators, and a colored *lifespan bar* (per-id stable color). A
  nested `▾ TRANSFORM` group expands to the 8 property TrackRows; both
  the element row and its TRANSFORM group are independently
  collapsible. Clicking an element header selects it (so the Inspector
  follows).

## Risks / Trade-offs

- **Iframe reload per frame is wasteful while scrubbing.** Acceptable for v1
  because the scene blob is the same, the runtime is small, and a real
  postMessage scrub channel is a clear follow-up once the dock is in place.
  We debounce reloads to one per animation frame to keep scrub smooth.
- **No undo for keyframe edits in v1.** The PRD doesn't list it under
  Acceptance, and the broader undo story is its own milestone; we surface
  destructive ops (delete) behind explicit user input.
- **Color tracks omitted.** Out of scope per PRD wording (the explicit list
  of eight numeric properties). Schema still supports them, so adding them
  later is a one-row change in the helper map plus a value-editor swap.
- **Selection size = 1 only.** Acceptable v1 limitation, mirrors most other
  editors. Multi-element timelines would need a UX choice the PRD doesn't
  request yet.
