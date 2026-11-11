# Live frame placement feasibility

The template carrier already includes geometry for each Look. Bridge and Preview both resolve
plate geometry through lookPlateRects. The page renderer can move authored nodes through
applyArrangementToNodes. That function currently applies geometry to root elements, while Looks
can instantiate nested compositions. Extending the runtime to identify the frame and its
instance is necessary before using that mechanism for operator placement.

- Carry the opt-in and resize policy from Designer to the declaration for the frame instance.
- Record a draft in composition pixels, keyed by row, Look, and frame instance. Transform the
  authored frame and its attached title, mask and fallback consistently in the preview.
- Resolve one geometry for the page and the engine. Take uses it before opening the frame.
  Update on air needs a single guarded commit of the page geometry and the seated producer's
  fill and clip. On a partial failure, restore the last applied geometry or report the failure
  without claiming success. The source must keep playing during a placement change.
- Verify both the actual page rectangle and output geometry, including nested Looks, position
  offsets, template reload and multiple uses of the same source.
