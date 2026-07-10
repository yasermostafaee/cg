# Design — fix-pen-multi-shape (B-037)

## Recon findings (Part B — live probes against the built dist, 2026-07-10)

Method: temporary Playwright probe spec (deleted after recon) driving the real built app via the
E2E fixtures; plus a `setTool` call-site census and git archaeology.

### 1. Baseline happy path — BROKEN, by the Gizmo (not by the suspected PathEditor)

Draw 3 anchors, click the first anchor to close: **the path stays open (`fill="none"`), the pen
stays pressed** — `penPointerDown` never saw the click. Cause: `addElement` auto-selects
(`slices/elements.ts` sets `selection: new Set([element.id])`), so from the 2nd anchor the draft is
the selected element and the **Gizmo mounts over it mid-draw** (its mount condition has NO tool
gate). Its interactive surfaces — corner resize hits, edge strips laid along every bbox side,
rotation zones just outside the corners — sit exactly where pen clicks go; the first anchor is by
construction on the draft's bbox boundary (usually a corner), so the close-click lands on a resize
handle and starts a resize drag of shape 1. That is literally the reported "subsequent clicks only
modify the FIRST shape", with no tool switch involved. Probe log: `gizmo visible after 2 anchors:
true`, `paths after close-click: 1`, `pen still pressed: true`, `fill: none`.

### 2. Mechanism 1 (draft survives a tool switch) — CONFIRMED

2 anchors → toolbar Select → toolbar Pen → click far away → Enter: **one** path element whose
anchor count grew (no second element ever appears). The module-level `draft` is cleared only by
`finishPen`; `setTool` does not touch it. A composition switch mid-draw leaks the same way
(`setActiveComposition` clears selection/keyframes but not the pen draft — code recon), stranding
the draft's element in the previous composition while the next pen click keeps appending to it.

### 3. Mechanism 2 (PathEditor mounts regardless of tool) — REFUTED literally, confirmed in spirit

`PathEditor`'s mount condition has included `tool === 'cursor'` since D-109 itself (`git log -S`:
b176a5a) — with the pen armed, zero `[data-cg-anchor]` squares render (probe-confirmed). The
click-hijack the hypothesis described is real but comes from the **Gizmo** (finding 1): with shape
1 finished + selected and the pen re-armed, `gizmo visible (pen armed): true` and a click on the
bbox edge midpoint feeds an edge-strip resize, not a new draft anchor. (A cursor-tool click on a
selected path's segment inserting an anchor is D-109's _intended_ edit behavior and stays.)

### 4. Mechanism 3 (forced tool reset, no feedback) — CONFIRMED

`finishPen` hard-codes `setTool('cursor')`; Esc mid-draw finishes OPEN and returns to the cursor
(probe: `paths after Esc: 1`, `fill: none`, `select pressed: true`). There is no rubber band, no
close affordance, no draft-anchor markers — nothing distinguishes "path in progress" from "done".

### 5. `setTool` census while `isPenDrawing()` is possible

- `CanvasToolbar` onClick (the studio toolbar) — the mid-draw switch path.
- `ToolRail` onClick (same pattern; rail without a pen button).
- `finishPen` itself (removed by this change).
- Creator-tool handlers and `insertSharedLogo` reset to cursor, but only run when THEIR tool is
  active — unreachable mid-draw.
- **No keyboard tool shortcuts exist today** (no `V`/`P` bindings in `App.tsx` / `keyboard.ts`;
  the prompt's "`V`" doesn't exist in this app) — but the fix must not depend on that staying
  true, so the cleanup hooks the tool STATE, not the callers.

## Decisions

### D1 — lifecycle choke point: a `CanvasOverlay` effect watching `tool` + `activeCompositionId`

`endPenSession()` runs whenever the tool leaves `pen`, the active composition changes, or the
overlay unmounts (effect cleanup). Watching the store STATE covers every current and future
`setTool`/`setActiveComposition` caller at one choke point. Rejected alternative: a module-level
store subscription inside `pen-draw.ts` — it would run store actions from inside the store's own
listener notification loop (re-entrant `set()`), a race the React effect avoids by construction.
The window between `setTool` and the effect firing is not user-observable (no pointer event can be
processed in between).

### D2 — exit semantics: ≥ 2 anchors FINISH (open), < 2 cancel

As directed. Justification: a ≥ 2-anchor draft is already a live, schema-valid element the operator
deliberately placed — finishing it open preserves their work (and matches what Enter would have
done); a 1-anchor draft was never added to the scene (`commit` requires ≥ 2 points, so
`created ⇒ points ≥ 2` — the `< 2 && created` degenerate branch is unreachable), so canceling it
is a pure state reset with nothing to remove. `endPenSession` does NOT touch selection or the tool:
the finished element is already selected (addElement auto-select) in the tool-switch case, and in
the composition-switch case `setActiveComposition` has just cleared selection — re-selecting a
cross-composition id would corrupt the new context. It marks one history boundary when a draft was
committed, closing the draw as a single undo step.

### D3 — Esc cancels; explicit exits only

While drawing: Enter / double-click finish open; first-anchor click closes; **Esc cancels**
(removes the created element via `removeElement`, then a history boundary — undo behaves like any
other delete). With the pen armed but idle, Esc drops to the cursor tool. This REPLACES the D-109
"Enter / Esc / double-click finish open" + "tool returns to cursor" spec text (superseded text
replaced in the delta, per the spec-discipline rule). The pen keyboard branch gains the app's
standard editable-target guard (Enter/Escape in an inspector input no longer finish/cancel a
draft — matches every other global shortcut; `e.key` is fine for Enter/Escape per CLAUDE.md).

### D4 — edit-vs-draw separation gates the GIZMO (the probe-confirmed hijacker)

`Gizmo` mounts only while `tool !== 'pen'`; `PathEditor` keeps its `tool === 'cursor'` gate (now
spec'd). `MultiGizmo` needs no gate (visual-only, `pointerEvents: none`). Deliberately scoped to
the pen: other creator tools' one-click-and-snap-back flow barely exposes the hijack, and widening
the gate (`tool === 'cursor'`) would change their behavior outside B-037's scope.

### D5 — draw-state feedback: local pointer state + a non-interactive SVG in the frame box

`CanvasOverlay` tracks the pointer's scene position in React state (updated on `pointermove` only
while the pen is drawing; cleared on leave/exit) and renders, inside the existing `frameRef` box:
draft anchor markers, a rubber band from the last anchor to the pointer — a cubic through the last
anchor's `out` handle when it is smooth, a straight segment otherwise — and a close-affordance
ring on the first anchor when `points ≥ 2` and the pointer is within the close radius
(`PEN_CLOSE_PX / scale`, the same test `penPointerDown` applies). The overlay is
`pointer-events: none` (it can never become a new hijacker) and uses `theme.ts` `colors.accent`
(no new icons, no `@cg/ui` changes). `pen-draw.ts` exposes read-only draft getters
(`penDraftPoints()`) + `PEN_CLOSE_PX` so the overlay renders from the same state the state machine
uses. Draft mutations re-render via the store (commit → scene change); the pointer state covers
the pre-commit first anchor as soon as the pointer moves.

### D6 — id hardening

`el-${Date.now()}` → `freshElementId()` (`state/scene-doc.ts`), the store's shared generator
(timestamp + random suffix). Two drafts created in the same millisecond can no longer collide.

## Review round (multi-agent adversarial verification, 2026-07-10)

A 3-lens review (state machine / cross-tool regressions / spec-test-docs consistency) with
two-skeptic verification per finding ran against the working tree before shipping. Confirmed
findings and their resolutions:

- **`cancelPen` lacked a leading history boundary** (fixed): the removal coalesced into the last
  anchor's undo entry when Esc followed a click within `COALESCE_MS`, so Ctrl+Z resurrected a
  PARTIAL phantom path. Fix mirrors the App Delete handler: `markHistoryBoundary()` BEFORE
  `removeElement` (+ a trailing one closing the removal as its own step). Unit-tested
  (undo-after-cancel restores the whole path).
- **Store-side removal mid-draw left a zombie draft** (fixed): Delete acts on the auto-selected
  draft element and Ctrl+Z steps the scene back while the module draft keeps its points — dead
  clicks, phantom feedback, a resurrected undone anchor, and `finishPen` selecting a nonexistent
  id. Fix: a staleness check (`draftIsStale` — element gone, not a path, or anchor count desynced)
  drops the draft lazily in `isPenDrawing`/`penDraftPoints` and at every state-machine entry
  point; a stale draft dies without touching the store (never resurrects, never removes the
  survivor an undo restored). Unit + E2E tested. NOTE: this intentionally ENDS the draft on
  undo-mid-draw rather than editing it back one anchor (undo-aware drafting is out of scope).
- **Pen Esc didn't yield to bind mode / inline text editing** (fixed): one Esc press both exited
  bind mode and canceled the draft (bind mode is reachable mid-draw — `setBindMode` doesn't touch
  the tool). The ownership guard now precedes the pen branch in the keyboard handler.
- **Feedback overlay lingered after Esc on an uncreated draft** (fixed): canceling a 1-anchor
  draft performs no store write, so nothing re-rendered until the next pointer move. The keyboard
  handler now clears the pointer state (`setPenPointer(null)`) on finish/cancel.
- **Composition-switch exit had no end-to-end coverage** (fixed): `pen-multi-shape.spec.ts` now
  switches compositions mid-draw and verifies the finish-in-place + fresh-session behavior. (The
  unmount half shares the same effect-cleanup path; unit + comp-switch coverage stands in for it.)
- **`docs/prd/designer.md` D-119 note still described B-037 as "keep-or-remove"** (fixed): now
  records the KEEP + fix decision and the in-progress branch.

Confirmed-but-intended (documented, not changed): with the pen staying armed, a slow second click
on the just-closed path's close point starts a new 1-anchor draft at that spot — that IS the
spec'd "next pointer-down starts a NEW element" flow (Illustrator behaves the same); Esc discards
it. Refuted by verification (no change): "the exit effect only watches `tool`" (it watches
`activeCompositionId` too), and the double-click-finish/dblclick-anchor concerns (that path is
unchanged from D-109).

## Known warts left unchanged (out of scope)

- A double-click finish records the dblclick's two pointer-downs as two ~coincident trailing
  anchors before finishing (pre-existing D-109 behavior; invisible in the rendered path).
- Other creator tools still mount the Gizmo over a stale selection while armed (same hijack class,
  one-click exposure — see D4).
- `CanvasOverlay`'s other creator tools keep their `el-${Date.now()}` ids; only the pen (which can
  create many elements in quick succession) is hardened here.
