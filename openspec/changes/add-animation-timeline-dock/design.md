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
- Per-keyframe easing UI — the schema's `easing` field defaults to `linear`
  in v1; an easing picker can land later.
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
- **Editing the value at the current frame** (via Inspector) detects whether
  the playhead sits on an existing keyframe for that property; if it does,
  the existing keyframe's `value` is updated; otherwise the operator's edit
  flows through the normal static-transform mutation and the track is
  untouched. This keeps the "current frame is just a value" mental model from
  Loopic without forcing every Inspector edit to spawn a keyframe.
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
