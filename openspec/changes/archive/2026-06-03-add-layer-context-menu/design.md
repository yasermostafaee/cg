# Design — Layer right-click context menu

## Decisions

### 1. Color persists as a per-element `timelineColor`
The lifespan bar color was a deterministic hash of the element id
(`lifespanColorFor`). To let the operator override it, store the choice on the
element as optional `timelineColor` (on `ElementBaseSchema`, so every element
kind gets it). The timeline reads `element.timelineColor ?? lifespanColorFor(id)`
— absent keeps the old behavior, so existing scenes/`.vcg` are unaffected and no
`schemaVersion` bump is needed. The swatch palette and labels mirror tc.png.

### 2. Clipboard is module-level, not scene/undo state
Copy/Cut/Paste need a buffer that survives between right-clicks but is not part
of the document. A module-level `clipboardElement` (alongside the existing
`past`/`future` history vars) keeps it out of the scene and out of undo. It is
cleared on `setScene` (so you can't paste across a project switch) and `_reset`
(test isolation). The menu calls `hasClipboardElement()` when it opens to
enable/disable Paste.

### 3. Cloning reassigns ids recursively
Paste and Duplicate must never reuse an id. `cloneElementWithNewIds` deep-clones
(`structuredClone`), assigns a fresh `el-<ts>-<rand>` id, suffixes the name with
" copy", and recurses into container children via `reassignIdsDeep`. Duplicate
inserts at `originalIndex + 1` in the same layer; Paste inserts after the
selected element (same layer) or appends to the first layer, falling back to
`addElement` when the scene has no layers yet.

### 4. "Fit workspace" = fit lifespan to the active region
Per the product decision, this sets the element's `lifespan` to
`activeRangeOf(scene)` (the resized play window from D-012), reusing the
existing `updateElementLifespan` clamp. (Alternative readings — fit to the full
total, or resize the element on the canvas — were rejected for this item.)

### 5. Menu as a fixed full-viewport backdrop
The menu renders inside a `position: fixed` backdrop covering the viewport;
a pointer-down on the backdrop (or `Escape`) closes it, and the menu/submenu
clamp into the viewport. This mirrors the existing `ProjectAssetsPanel`
context-menu pattern rather than introducing a portal/popover dependency. The
Color submenu opens on hover to the right of the menu.

## Deferred

- **Move to nested composition** — needs a nested-composition concept the schema
  doesn't have yet (only `container` elements). Tracked as future work; omitted
  from the menu rather than shown disabled to avoid implying it's coming in this
  change.

## Risks

- **Right-click also selects:** the handler selects the element before opening
  the menu so the action targets what the operator clicked — matches expected
  behavior and keeps Paste's "after selection" insertion intuitive.
- **`.vcg` round-trip:** `timelineColor` is an optional schema field serialized
  by `@cg/vcg-format` automatically; no packer changes.
