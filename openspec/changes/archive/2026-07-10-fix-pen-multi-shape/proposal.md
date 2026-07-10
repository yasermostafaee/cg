# Pen tool multi-shape fix (B-037 — KEEP + fix, owner decision 2026-07-07)

## Why

B-037: draw a pen shape, try to draw a second — subsequent clicks only modify the FIRST shape, and
the tool feels hard to use. The owner chose direction (a): fix the bug and keep the pen (keeps the
queued D-110 path-morphing meaningful). Recon (live probes against the built app — see `design.md`)
confirmed a cluster of cooperating causes:

1. **The draft never dies on tool exit.** `pen-draw.ts` holds a module-level `draft` that only
   `finishPen` clears. Switching tools mid-draw (toolbar or programmatic) leaves it alive, so the
   next pen session's first click APPENDS to shape 1 instead of starting shape 2 (probe-confirmed:
   one element, growing anchor count). A composition switch mid-draw leaks it the same way.
2. **The transform gizmo hijacks pen clicks.** `addElement` auto-selects the draft, and the Gizmo
   mounts with NO tool gate — its corner/edge/rotation hit-zones sit exactly on the draft's bbox.
   The close-click on the first anchor (always a bbox corner) lands on a resize handle: the path
   never closes and the click RESIZES shape 1 (probe-confirmed: after the close-click the path is
   still open and the pen still armed). The originally suspected `PathEditor` hijack is REFUTED —
   its `tool === 'cursor'` mount gate shipped with D-109 itself.
3. **No draw-state feedback + forced tool reset.** `finishPen` snaps the tool back to `cursor`
   after every shape (re-pick the pen per shape), and there is no rubber-band segment or
   close-affordance highlight — an operator cannot tell a path is still in progress, so "starting
   shape 2" silently extends shape 1.

## What Changes

- **Draft lifecycle becomes explicit and leak-proof.** An in-progress draft is
  finished-or-canceled on ANY exit from the pen tool — tool switch, composition switch, overlay
  unmount: a draft with ≥ 2 anchors is FINISHED (open), a < 2-anchor draft is canceled (nothing
  persists — a 1-anchor draft was never added to the scene). `pen-draw.ts` exports `cancelPen()`
  and `endPenSession()`; `CanvasOverlay` wires the cleanup via an effect watching the active tool
  and composition (every `setTool` caller is covered at one choke point).
- **Consecutive draws.** After a path is finished (close-click / Enter / double-click) the pen
  STAYS armed and the next pointer-down starts a NEW independent element — N draws yield N
  elements (Illustrator/Loopic flow). Returning to the cursor is explicit (toolbar, or Esc when
  nothing is being drawn). `finishPen` no longer forces `setTool('cursor')`.
- **Esc semantics change (supersedes the D-109 text).** While drawing, Esc CANCELS the current
  draft (removes the created element); Enter / double-click finish it open; clicking the first
  anchor closes it. With no active draft, Esc exits the pen back to the cursor.
- **Edit-vs-draw separation.** While the pen tool is armed, NO edit affordance is interactive over
  the canvas: the Gizmo (the actual probe-confirmed hijacker) gains a `tool !== 'pen'` mount gate,
  and `PathEditor` keeps its select-tool-only gate — now spec'd. Editing an existing path stays a
  cursor-tool activity.
- **Draw-state feedback.** While drafting: placed anchors are marked, a live rubber-band preview
  segment runs from the last anchor to the pointer (curved through the last anchor's out handle
  after a smooth drag), and the first anchor shows a visible close affordance when the pointer is
  within the close radius. Non-interactive overlay inside the existing frame box, theme-token
  colors, no new icons.
- **Collision hardening.** The pen's fragile `el-${Date.now()}` element id is replaced with the
  store's shared `freshElementId()` helper.

## Capabilities

- **`designer-path-element`** (MODIFIED): "Pen tool draws a bézier path" — draft lifecycle,
  pen-stays-armed, N-draws-N-elements, new Esc semantics (replaces Esc-finishes-open); "A selected
  path is fully editable" — edit affordances are select-tool-only, pen clicks are never hijacked.
  ADDED: "Pen draw-state feedback" (rubber band + close affordance).

## Impact

- `apps/designer/src/renderer/features/canvas/pen-draw.ts` — lifecycle (`cancelPen`,
  `endPenSession`, `finishPen` without the tool reset), draft getters for the feedback overlay,
  `freshElementId()`.
- `apps/designer/src/renderer/features/canvas/CanvasOverlay.tsx` — pen-exit cleanup effect
  (tool / composition / unmount), reworked pen keyboard branch (Enter finish, Esc cancel-or-exit),
  Gizmo mount gate, rubber-band + close-affordance overlay.
- Tests: NEW unit `apps/designer/tests/pen-draw.test.ts` (draft state machine);
  E2E NEW `apps/designer/tests/e2e/pen-multi-shape.spec.ts` (B-037's named regression: two
  sequential draws → two independent elements, mid-draw tool switch, no edit-affordance hijack,
  Esc-cancel, close-click + pen-stays-armed); `pen-path.spec.ts` updated to the new finish flow.
- Docs: canvas feature `README.md` pen/tools section (engine doc-sync); PRD
  `docs/prd/bugs-designer.md` B-037; `docs/ROADMAP.md`.
