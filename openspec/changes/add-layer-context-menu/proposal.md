## Why

Operators can only act on a timeline layer through scattered affordances (the
Inspector's remove button, the row's eye/lock toggles). There is no quick,
in-context way to recolor a layer, duplicate it, copy/paste it, or fit its
lifespan to the scene. The reference tool exposes all of this from a single
right-click menu on the layer; D-013 brings that to the Designer timeline.

## What Changes

- Right-clicking a timeline layer (element row — label or lane) opens a
  **context menu** at the cursor with: **Color** (a submenu of named swatches),
  **Fit workspace**, **Copy**, **Cut**, **Paste**, **Duplicate**, **Delete**.
- **Color** sets a persistent per-element `timelineColor` used by the lifespan
  bar (falling back to the existing deterministic per-id color when unset).
- **Fit workspace** sets the element's `lifespan` to the scene's active region
  (the resized play window from D-012).
- **Copy / Cut / Paste** use an in-memory element clipboard. Paste (and Cut →
  Paste, Duplicate) deep-clone with fresh ids — recursively for container
  children — so pasted subtrees never collide with the originals. Paste is
  disabled when the clipboard is empty.
- **Duplicate** inserts a clone directly after the original in the same layer
  and selects it. **Delete** removes the layer.
- The menu closes on outside-click or `Escape` and clamps inside the viewport.
- **"Move to nested composition" is intentionally deferred** — the app has
  container elements but no separate nested-composition concept yet; it will be
  specced as its own capability later.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `designer-animation-timeline`: adds a **layer right-click context menu** with
  Color / Fit-workspace / Copy / Cut / Paste / Duplicate / Delete, plus a
  persistent per-element `timelineColor` for the lifespan bar.

## Impact

- **Schema:** `packages/shared-schema/src/elements.ts` — add optional
  `timelineColor: HexColorSchema` to `ElementBaseSchema` (applies to every
  element kind; absent ⇒ deterministic color, backward compatible).
- **Store:** `apps/designer/src/renderer/state/store.ts` — add
  `setElementTimelineColor`, `fitElementLifespanToActiveRange`, `copyElement`,
  `cutElement`, `pasteElement`, `duplicateElement`, `hasClipboardElement`; a
  module-level element clipboard cleared on `setScene`/`_reset`; deep-clone
  helpers that reassign ids recursively.
- **Timeline UI:** new `features/timeline/LayerContextMenu.tsx`; `ElementRow`
  gains an `onContextMenu` prop wired on both the label and lane; `TimelineDock`
  owns the menu state and renders it, and now sources the lifespan-bar color
  from `element.timelineColor ?? lifespanColorFor(id)`.
- **Unchanged:** `@cg/template-runtime` (optional schema field flows through),
  `@cg/vcg-format`, the bridge, storage paths.
- **Tests:** `apps/designer/tests/store-layer-actions.test.ts` — color,
  fit-to-active-region, copy/paste clone identity, cut, duplicate adjacency,
  empty-clipboard no-op, clipboard cleared on scene switch.
- **Dependencies:** none added.
