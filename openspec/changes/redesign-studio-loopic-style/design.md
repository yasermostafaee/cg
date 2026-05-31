## Context

The Designer shell today launches straight into the studio with the
project picker (`LibraryPanel`) docked on the left. The Loopic
reference treats project selection as a **pre-studio screen** and the
studio as a separate, viewport-filling workspace. D-007 also asks for
the standard editor ergonomics — top toolbar, zoom controls, wheel /
Ctrl-wheel behaviour, hand-tool pan, right-click → remove keyframe.

`ProjectStore.newScene` already creates and activates a scene; the
existing call site (`projects.create`) only passes name + templateType
and uses fixed `1920×1080 @ 50fps`. We add an optional
`resolution` / `frameRate` override path so the New Project modal can
write its picks without touching the schema.

## Goals / Non-Goals

**Goals:**
- Landing screen at app start: Demo (starter templates) + Recent
  projects + a big "New project" button.
- New Project modal: name + resolution preset (or custom) + frame
  rate; confirm creates + opens the project; cancel returns to
  landing.
- Studio view fills the viewport (still the existing internal
  layout with Splitter resizers from the previous pass).
- Top toolbar above the canvas; six tools: cursor, rectangle, text,
  ellipse, hand (pan), image.
- Canvas zoom in / zoom out / fit / reset icons + `Ctrl + wheel`
  zoom (cursor-centric) clamped to 10%–400%; plain `wheel` scrolls
  the inner viewport.
- Right-click on a keyframe diamond removes that keyframe.

**Non-Goals (deferred):**
- Real "Home / File / Edit / View / Import / Help" menu bar — keep
  the existing minimal chrome for v1; the studio's StatusBar still
  handles Save / Export.
- Mid-flight project-switching during studio (operator returns to
  landing via a "back to projects" button; multi-project tabs are
  out of scope).
- Smooth zoom animation; clamp + step is fine.
- Visual chrome polishes (gradients, hover states beyond the basics).
- Touch / gesture input.

## Decisions

- **`view: 'landing' | 'studio'` lives in the store.** The store
  already owns selection / scene state; routing alongside that keeps
  the App.tsx switch trivial. Loading a starter (`loadStarter`),
  confirming the new-project modal, or opening a recent → store
  flips `view` to `'studio'`. A "back to projects" button flips it
  back to `'landing'` and clears the active scene.
- **`projects.create` grows optional `resolution` + `frameRate`
  fields** in the bridge. The browser implementation in
  `ProjectStore.newScene` reads them when present, otherwise keeps
  the existing defaults. No schema change.
- **`'hand'` joins `DesignerTool`.** When `tool === 'hand'`, the
  canvas overlay's `onPointerDown` enters "pan mode" — `offset.x/y`
  updates as the cursor moves, no element creation / selection.
  Holding `Space` could toggle this in a follow-up, but v1 just uses
  the explicit tool.
- **Zoom is canvas-local, not stored.** `zoom` + `offset` are
  `CanvasArea` state; closing/reopening the canvas resets them. A
  global "view" reset is a follow-up if operators ask.
- **Wheel handling:** the canvas outer element gets a `wheel`
  listener (`passive: false`, `preventDefault` on `ctrlKey`). When
  `ctrlKey` is set, the delta becomes a zoom delta (logarithmic
  step). Otherwise the default browser scroll runs (we keep
  `overflow: auto` on the outer).
- **Right-click on a keyframe**: `onContextMenu={e =>
  { e.preventDefault(); removeKeyframe(...); }}` on the diamond
  div. No custom menu; the gesture is one-step like Loopic.
- **TopToolbar layout**: a single row of six icon buttons + the
  zoom controls on the far right of the canvas region (small icons
  so the bar stays slim). The icons are inline SVGs (no library
  added — keeps the bundle slim and matches the existing icon-free
  style).

## Risks / Trade-offs

- **`Ctrl + wheel` collides with browser zoom.** We `preventDefault`
  when `ctrlKey` is set over the canvas. The rest of the page never
  scrolls (locked viewport) so there's no surprise.
- **Hand tool over the existing body-drag for "move element".** When
  `tool === 'cursor'` the body-drag still moves the selected
  element; when `tool === 'hand'` clicks/drags only pan, never
  select. Operators switch via the toolbar.
- **Modal vs floating panel.** The New Project picker is a small
  modal because it blocks all other interaction; we render it via a
  fixed-position overlay (no portal needed — z-index does it).
- **Removing the side LibraryPanel** is a behaviour change for
  anyone who relied on the always-visible starter list. It's still
  reachable via the landing's "back to projects" affordance.
