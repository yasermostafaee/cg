## Why

D-007 asks for a Loopic-style two-screen flow: a **landing screen** for
picking a starter project or starting a new one, and a **studio screen**
that fills the viewport for editing. The current Designer dumps both
concerns into the same shell — the project picker is a docked panel
that competes with the editing area — and lacks the keyboard / mouse
ergonomics operators expect (top toolbar, zoom in/out, Ctrl-wheel zoom,
plain wheel scroll, hand-tool panning, right-click removes keyframes).
Closing the gap is what turns the Designer from "an editor with a
sidebar of starters" into a tool that **starts** at project selection
and **commits** to one project at a time.

## What Changes

- Add a top-level `view: 'landing' | 'studio'` state to the Designer.
  When no scene is open the shell renders a `LandingView` (Demo
  starters + Recent + a big "New project" button); when a scene is
  open the shell renders the studio (the existing Inspector + Canvas
  - Timeline layout).
- Add a `NewProjectModal` reached by the landing's "New project"
  button. The modal collects a name, resolution (1920×1080, 1280×720,
  1080×1920, custom W×H) and frame rate (25, 29.97, 50, 59.94, 60).
  Confirming creates the scene and switches to studio; cancelling
  returns to the landing.
- Move the tool selector from the side `ToolRail` to a horizontal
  `TopToolbar` above the canvas with tools: cursor, rectangle, text,
  ellipse, hand, image. Add the `hand` tool: when active, click-and-
  drag pans the canvas.
- Replace the canvas's hardcoded `SCALE = 0.5` with a `zoom` state
  driven by zoom-in / zoom-out / fit / reset buttons in the canvas
  header and by `Ctrl + wheel` over the canvas (clamped 10%–400%).
  Plain `wheel` (no Ctrl) scrolls the inner canvas viewport. Hand-tool
  drag is independent and pans the same viewport.
- Right-click on a keyframe diamond in the timeline removes that
  keyframe immediately (no menu, mirrors the Loopic reference).
- Drop the side `LibraryPanel` from the studio shell — the landing
  view covers project selection. (The `LibraryPanel` component is
  re-used inside `LandingView` so we don't lose the starter cards.)

## Capabilities

### New Capabilities

- `designer-shell`: landing / studio view routing, New Project modal,
  top toolbar.
- `designer-canvas-viewport`: canvas zoom (icons + Ctrl-wheel +
  clamp), panning via the hand tool, and plain-wheel viewport
  scrolling.

### Modified Capabilities

- `designer-animation-timeline`: right-click on a keyframe diamond
  removes the keyframe.

## Impact

- **Code:** `apps/designer/src/renderer` only.
  - `state/store.ts` — add `view`, `setView`, new `'hand'` tool
    variant in `DesignerTool`.
  - `features/shell/` — new `LandingView.tsx`, `NewProjectModal.tsx`,
    `TopToolbar.tsx`.
  - `features/canvas/CanvasArea.tsx` — `zoom`, `offset`, wheel
    handlers, zoom buttons; pass through to `CanvasOverlay`.
  - `features/timeline/TrackRow.tsx` — `onContextMenu` on the
    keyframe diamond.
  - `App.tsx` — route on `view`; render `TopToolbar` above the
    canvas; drop the side `LibraryPanel`.
- **Unchanged:** `@cg/shared-schema`, `@cg/template-runtime`, the
  bridge, storage. `projects.newScene` already accepts a template
  type — we extend the call site to also pass resolution/frame rate
  via a follow-up signature on the existing bridge.
- **Tests:** view routing, `newScene` with resolution/fps, hand-tool
  pans, zoom clamp, right-click removes keyframe.
- **Dependencies:** none added (custom SVG icons; no icon library).
