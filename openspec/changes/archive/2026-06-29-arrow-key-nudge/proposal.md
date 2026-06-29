# Arrow-key nudge for the selection (D-073)

## Why

Pixel-precise positioning today requires dragging — there is no keyboard nudge, the standard editor
behaviour. Adding arrow-key nudge reuses the existing keyframe-aware group-move commit path, so
animated and multi-selected elements behave EXACTLY as they do when dragged (incl. B-005-safe
keyframe-at-playhead), with no new position-writing logic.

## What Changes

- With one or more elements selected and no editable field focused, the arrow keys move the
  selection by 1px (scene px); holding **Shift** moves by 10px. Directions are SPATIAL (Left = −x,
  Right = +x, Up = −y, Down = +y), independent of RTL.
- A new store action `nudgeSelection(dx, dy)` resolves the movable members via the existing
  `collectGroupMoveTargets(...).movers` (selected, visible, unlocked, evaluated at the playhead) and
  loops the SAME `commitAnimatable('position.x'/'position.y', start + delta)` that `beginGroupDrag`
  uses — so keyframe routing is identical (a track on the axis → keyframe at the playhead; otherwise
  a static write). Locked/hidden members do not move. No snapping. The action sets NO history
  boundary (the caller owns it).
- A new global keydown effect in `App.tsx`, cloned from the Delete/Backspace handler: it bails when
  a modifier other than Shift is held, when the focus is an `input`/`textarea`/`select`/
  contentEditable, or when nothing is selected (no `preventDefault` in that case); otherwise it
  `preventDefault`s, sets ONE `markHistoryBoundary()` on the first event of a run (`!e.repeat`) so a
  held key (auto-repeat) collapses to one undo step, and calls `nudgeSelection`.
- Ripple: the nudge rows are added to the keyboard `ShortcutsModal`.

## Impact

- Affected specs: **designer-multi-select** (ADDED requirement — keyboard nudge of the selection,
  reusing the group-move delta path; applies to single + multi).
- Affected code: `@cg/designer` only — `renderer/state/slices/elements.ts` (`nudgeSelection`),
  `renderer/App.tsx` (keydown effect), `renderer/features/shell/ShortcutsModal.tsx` (rows).
- **No** schema / `@cg/template-runtime` / exporter / `.vcg` / runtime change. Nudge directions are
  spatial (not reading-order), so RTL is unaffected.
