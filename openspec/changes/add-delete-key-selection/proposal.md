## Why

The timeline already deletes a selected keyframe with Delete/Backspace, but a
selected **layer/shape** can only be removed via the right-click menu. Operators
expect the Delete key to remove the current selection from the keyboard. The
wrinkle: clicking a keyframe selects **both** the keyframe and its parent
layer/shape, so the key must have a clear precedence or it would delete the wrong
thing.

## What Changes

- **Delete / Backspace removes the current selection**, handled globally (works
  from the canvas or the timeline), with a single precedence rule:
  - if **any keyframe** is selected → delete **all** selected keyframes (and leave
    the parent layer/shape alone);
  - else if **any layer/shape** is selected → delete **all** selected layers/shapes.
- **Editable-field guard:** the key is ignored when an `input` / `textarea` /
  `select` / contentEditable element is focused, so typing Delete in the label
  field (etc.) never deletes a layer.
- **Undoable:** one keypress = one undo step (the existing history coalesces the
  synchronous delete burst).
- Consolidated into one store action `deleteSelection()` + one global handler in
  `App`; the timeline's previous keyframe-only Delete handler is removed (its job
  is now the keyframe branch of the shared path).

## Capabilities

### Modified Capabilities

- `designer-animation-timeline`: adds a keyboard Delete/Backspace requirement that
  removes the selection with keyframe-over-layer precedence (the spec already
  covers keyframe selection and layer delete via the context menu).

## Impact

- **Designer:** `state/store.ts` (`deleteSelection()` action); `App.tsx` (global
  Delete/Backspace handler with editable-field guard); `features/timeline/
TimelineDock.tsx` (remove the now-redundant keyframe-only handler);
  `features/shell/ShortcutsModal.tsx` (updated shortcut label).
- **Tests:** `apps/designer` store test — keyframe selected → keyframe deleted
  (layer kept); no keyframe, layer selected → layer deleted; multi-select deletes
  all; nothing selected → no-op; one delete is a single undo step.
- **No schema/runtime change.**
