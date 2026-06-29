# designer-shapes (D-060 delta)

## MODIFIED Requirements

### Requirement: Move and resize shapes

Shape elements (rectangle and ellipse) SHALL be movable and resizable through the same selection gizmo as every other element, and that gizmo SHALL trace the element's rendered geometry — the renderer's `scale(sx,sy) rotate(deg)` about the `anchor` (`transform-origin`) — so its border, handles, and rotate pivot stay glued to the shape under any scale (uniform or non-uniform) and rotation; no shape-specific transform logic is required. For an auto-sized text element (`fitMode: 'autosize'`), whose box size comes from its content rather than `transform.size`, the gizmo SHALL trace the element's RENDERED (measured) box rather than `transform.size`, and its resize handles (the four corners and four edges) SHALL be inert — body-drag move and corner rotate remain active, and dragging a resize handle does nothing (it does NOT silently switch the element to `fixed`). The measured size is used for the overlay display only and is never written back into the stored model.

#### Scenario: Operator moves and resizes a shape

- **WHEN** a shape is selected and the operator drags its body or a resize handle
- **THEN** the shape's transform position/size update and the preview reflects the new geometry

#### Scenario: Selection overlay stays glued under non-uniform scale

- **WHEN** a selected element has a non-uniform scale (`scaleX ≠ scaleY`), with or without a rotation
- **THEN** the selection border and its corner/edge handles align with the element's rendered corners (the `scale·rotate`-about-anchor parallelogram), not a rotated bounding rectangle, and they stay aligned as the scale or rotation changes

#### Scenario: Resize keeps the opposite corner glued under scale

- **WHEN** the operator drags a resize handle of an element that has a non-uniform scale
- **THEN** the opposite (fixed) corner stays glued to the shape while the dragged corner follows the pointer, and the size updates in the element's scaled, rotated frame

#### Scenario: Rotate pivots correctly after a scale

- **WHEN** the operator rotates an element that already has a non-uniform scale applied
- **THEN** the rotation pivots about the element's `anchor` (matching the renderer) and the handles continue to track the shape throughout the gesture

#### Scenario: An auto-sized text box shows an inert-resize gizmo that tracks the rendered box

- **WHEN** a text element with `fitMode: 'autosize'` is selected
- **THEN** the selection frame traces the element's rendered (measured) content box — staying glued as the content grows/shrinks and composing scale/rotation about the anchor as usual — and its resize handles are inert (shown disabled or hidden), while body-drag move and corner rotate stay active and dragging a resize handle does not resize the element nor switch it to `fixed`
