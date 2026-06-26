# Design — multi-select clipboard, context menu & shortcuts

## Context

D-076 and D-077 share one core (a selection-aware clipboard + ops), so they are one change. The
existing single-element ops (`copyElement` / `cutElement` / `duplicateElement` / `pasteElement` /
`fitElementLifespanToActiveRange`) and a `clipboardElement: Element | null` already exist; the work
is to generalize the clipboard to many elements and add whole-selection counterparts without
regressing the single ops (they have direct unit tests).

## Decisions

### Clipboard becomes `Element[]`

`clipboardElements: Element[]` (empty = nothing to paste). `getClipboard()` returns
`readonly Element[]`, `setClipboard(els)` replaces it, `hasClipboardElement()` is "non-empty". The
single ops adapt minimally: copy wraps one element in a 1-array, and `pasteElement` is a thin alias
for the new `pasteElements` — so there is ONE paste code path, and the existing
`store-layer-actions.test.ts` stays green unchanged.

### One undo step per multi-op

Each scene-mutating multi-op wraps its fan-out in `runAsSingleHistoryEntry` (leading + trailing
`markHistoryBoundary`), so N per-element `set()`s coalesce into ONE undo entry isolated from
neighbours. `copySelection` mutates no scene (clipboard only → no history). Copy/paste/duplicate
select the affected set in a trailing selection-only `set` (no scene change → no extra undo entry).
`duplicateSelection` re-locates each original by id on every step so a same-layer insert doesn't
shift the next target; `pasteElements` walks an incrementing insert cursor so clipboard order is
preserved after the selected element.

`cutSelection` removes elements via a direct `removeElement` loop (over a snapshot of the
selection ids), NOT via `deleteSelection`. `deleteSelection` has keyframe-first precedence (if a
keyframe is selected it deletes the keyframe and returns) — reusing it would let Cut copy a layer
to the clipboard while deleting a co-selected keyframe instead of the layer (reachable: select an
element, click one of its keyframe diamonds, then Ctrl+X / menu Cut). Removing elements
unconditionally keeps Cut symmetric with Copy; `removeElement` also clears any now-dangling
keyframe selection. (Found by the adversarial review; covered by a regression unit test.)

### Target normalization lives at the row's `onContextMenu`, not in the menu

The PRD note placed normalization "in LayerContextMenu", but `ElementRow.tsx` was the real source
of the bug: its `onContextMenu` UNCONDITIONALLY ran `setSelection([element.id])`, destroying any
multi-selection BEFORE the menu mounted — so the menu could never see the original selection. The
fix is therefore at the event source: right-click now replaces the selection only when the clicked
row is NOT already in it (`if (!selection.has(id)) setSelection([id])`). The menu then simply acts
on `current.selection` via the selection-aware ops; it no longer reads `elementId` itself (kept on
`Props` only to document the opener's contract). This is the "chase every ripple" correction.

### Color is selection-aware too

Per follow-up, the Color submenu applies the chosen swatch to every selected layer
(`setSelectionTimelineColor`, one undo) — consistent with the other menu actions.

### Shortcuts mirror the Delete handler

The Ctrl/Cmd+C/X/V keydown effect in `App.tsx` is cloned from the Delete/Backspace handler: same
editable-focus guard, same "do nothing / don't `preventDefault` when there's nothing to act on"
discipline, and one `markHistoryBoundary()` before the op. The existing capture-phase keydown
handler explicitly leaves clipboard shortcuts alone and never `stopPropagation`s, so the bubble
listener runs cleanly.

## Risks / trade-offs

- The single-element ops remain (as thin adapters/aliases) rather than being deleted, to keep their
  direct tests and any other callers working — a small amount of surface kept deliberately.
- Pasting into a doc with no layers falls back to `addElement` per clone (rare edge); the common
  case inserts after the selected element in its layer.
