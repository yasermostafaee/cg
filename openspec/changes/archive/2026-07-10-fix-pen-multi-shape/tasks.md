# Tasks — fix-pen-multi-shape (B-037)

## 1. Recon (Part B — RECON FIRST)

- [x] Build the app; probe the happy path (draw → close-click → re-arm → draw) — close-click is
      eaten by the mid-draw Gizmo (addElement auto-select + no tool gate); path never closes.
- [x] Probe the mid-draw tool switch (toolbar) — draft survives, next pen click appends to shape 1
      (mechanism 1 CONFIRMED). Composition-switch leak confirmed by code recon.
- [x] Probe PathEditor with the pen armed — `tool === 'cursor'` gate shipped with D-109
      (mechanism 2 REFUTED literally; the hijacker is the Gizmo).
- [x] Probe Esc mid-draw — finishes open + forces cursor (mechanism 3 CONFIRMED); no draw-state
      feedback exists.
- [x] `setTool` call-site census while `isPenDrawing()` (toolbar, rail, finishPen, creator resets;
      no keyboard tool shortcuts exist) → findings + decisions in `design.md`.

## 2. Docs — record the decision (Part A)

- [x] `docs/prd/bugs-designer.md` B-037: drop "pending a keep-or-remove decision", record "owner
      decision 2026-07-07: KEEP + fix (direction a)", raise priority low → medium (gates D-119).
- [x] `docs/ROADMAP.md` B-037 line → in progress with branch + change dir.

## 3. Implementation — `pen-draw.ts`

- [x] `finishPen(closed)` no longer calls `setTool('cursor')` (pen stays armed).
- [x] `cancelPen()` — remove the created element (if any), clear the draft, history boundary.
- [x] `endPenSession()` — ≥ 2 anchors → finish open (no selection/tool writes); < 2 → cancel;
      idempotent (no-op with no draft).
- [x] Draft id via `freshElementId()` (collision hardening).
- [x] Read-only getters for the feedback overlay: `penDraftPoints()`, `PEN_CLOSE_PX`.

## 4. Implementation — `CanvasOverlay.tsx`

- [x] Pen-exit cleanup effect: `endPenSession()` on tool change away from pen, on
      `activeCompositionId` change (new prop from `CanvasArea`), and on unmount.
- [x] Keyboard: while drawing — Enter finishes open, Esc CANCELS; pen armed + idle — Esc exits to
      cursor; standard editable-target guard; `e.key` for Enter/Escape (layout-stable per
      CLAUDE.md).
- [x] Gizmo mount gated `tool !== 'pen'` (PathEditor keeps its cursor-tool gate).
- [x] Rubber-band preview (cubic through a smooth last anchor's out handle) + draft anchor
      markers + first-anchor close-affordance ring within the close radius — non-interactive SVG,
      theme accent tokens.

## 5. Tests

- [x] Unit `apps/designer/tests/pen-draw.test.ts` — the draft state machine: two clicks create a
      selected 2-anchor element; tool-switch (`endPenSession`) finishes a ≥ 2-anchor draft open and
      cancels a 1-anchor draft; after a finish the next pointer-down creates a NEW element id;
      Esc-cancel removes the created element; close-click closes without leaving the pen; fresh
      ids differ across sessions.
- [x] E2E `apps/designer/tests/e2e/pen-multi-shape.spec.ts` (B-037's named regression):
      (1) two sequential pen draws → TWO independent path elements, shape 1's anchor count/geometry
      unchanged; (2) mid-draw tool switch → return → draw → still a new element, shape 1 untouched;
      (3) shape 1 selected + pen armed: a click near its outline does NOT modify it (no
      inserted anchor / no resize) and starts shape 2; (4) Esc mid-draw cancels — no element
      persists; (5) close-click closes and the pen STAYS armed.
- [x] E2E `pen-path.spec.ts` updated to the new finish flow (pen stays armed; switch to Select
      before counting edit-overlay anchors).

## 6. Docs — engine doc-sync

- [x] `apps/designer/src/renderer/features/canvas/README.md` pen/tools section: lifecycle,
      Esc-cancel semantics, gizmo gate, draw-state feedback, `endPenSession` wiring.

## 7. Review round (multi-agent adversarial verification — see `design.md`)

- [x] `cancelPen`: LEADING history boundary before `removeElement` (fast-Esc coalescing made undo
      restore a partial phantom path) + unit test (undo-after-cancel restores the whole path).
- [x] Stale-draft guard (`draftIsStale`/`dropStaleDraft`): a Delete/undo that removes or shrinks
      the draft's element mid-draw kills the draft (no zombie clicks, no resurrection, no dangling
      selection) + unit tests + Delete-mid-draw E2E.
- [x] Pen keyboard branch yields to bind mode / inline text editing (shared Esc no longer
      double-fires); feedback overlay cleared on key finish/cancel (no lingering rubber band on an
      uncreated draft).
- [x] Composition-switch-mid-draw E2E (finish-in-place in comp1, fresh session in comp2).
- [x] Spec delta: external-removal/undo scenario + undo-the-cancel wording added.
- [x] `docs/prd/designer.md` D-119 sequencing note updated to the KEEP + fix decision.

## 8. Gate + ship (Part E)

- [x] `@cg/designer`: typecheck + lint + test + build, uncached at least once (`turbo --force`,
      15/15 incl. 621 unit tests), plus root `pnpm format:check`; `pnpm test:e2e` against the
      fresh dist (187 passed).
- [x] `pnpm openspec validate fix-pen-multi-shape --strict` and `--all --strict` (32/32).
- [x] Conventional commit (`4cf9fce` + the pre-approved docs rider `92eb554`), pushed with the
      remote head verified; `gh` unavailable so the compare link was handed to the owner (merged
      as #267, `ade2f9f`); B-037 flipped `[~]` with branch + change dir. Archived 2026-07-10
      after the owner verified the drawing feel by hand.
