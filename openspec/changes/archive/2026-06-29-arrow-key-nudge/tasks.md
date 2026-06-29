# Tasks — Arrow-key nudge for the selection (D-073)

## 1. Store action

- [x] 1.1 `state/slices/elements.ts` — `nudgeSelection(dx, dy)`: resolve movers via
      `collectGroupMoveTargets(activeLayersOf(scene), selection, <any selected id>, currentFrame,
activeDocOf(scene).resolution).movers`; for each, `commitAnimatable(id, 'position.x', x + dx)`
      and `commitAnimatable(id, 'position.y', y + dy)` (the exact keys `beginGroupDrag` uses). No
      snapping. No `markHistoryBoundary` inside (caller owns it). No-op when nothing is selected.

## 2. Keydown handler

- [x] 2.1 `App.tsx` — new `useEffect` keydown handler cloned from Delete/Backspace: bail on
      `ctrlKey/metaKey/altKey` (Shift allowed); bail on `INPUT`/`TEXTAREA`/`SELECT`/contentEditable
      target; handle only the four arrows; if `selection.size === 0` return WITHOUT `preventDefault`;
      else `preventDefault`, `step = e.shiftKey ? 10 : 1`, map Left/Right/Up/Down → delta, and
      `if (!e.repeat) markHistoryBoundary()` then `nudgeSelection(dx, dy)`.

## 3. Ripple

- [x] 3.1 `features/shell/ShortcutsModal.tsx` — add the nudge rows (Arrow = move 1px; Shift+Arrow =
      move 10px).

## 4. Tests

- [x] 4.1 Unit (`tests/`): single + multi selection move by the delta; a locked/hidden member is
      unaffected; an animated element keyframes at the playhead.
- [x] 4.2 E2E (`tests/e2e/`): ArrowRight moves x by 1; Shift+ArrowRight by 10; a held key then ONE
      Ctrl+Z reverts the whole run; nothing selected → arrows do nothing; an arrow in an inspector
      number field does not nudge.

## 5. Gate (batched with D-072 at the end)

- [ ] 5.1 Part of the batch green gate + E2E (see the batch PR).
