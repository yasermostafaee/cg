# Design — pan a cropped live input (D-178)

## One value, one geometry function

`cropFocus = {x,y}` is normalized to `0..1`; absence resolves to `{0.5,0.5}`. For `cover`, the fitted
picture origin is `box.origin + (box.size - picture.size) * focus`. Only an overflowing axis changes.
`contain` remains centred because it crops no source edge.

The value lives on the plate element without a look group and beside each look's rect/fit maps when a
look group exists. The Bridge resolves the active look and passes the value into `fitPictureToBox` via
`liveSourceFit`; no consumer re-derives crop arithmetic.

## Compatibility

All fields are optional. Old scenes, packages and persisted template records parse unchanged. Missing
focus produces exactly the old centred crop. Schema bounds reject values outside the source frame.

## Operator surface

The Designer Inspector has no crop-focus editor. Previously authored values remain readable in the
scene and on export. The proposed CG Control gesture targets the selected, visible `cover` plate on
its actual picture. Movement is clamped to the overflowing axes and keeps the authored plate fixed.

PGM maps drag distance through the letterboxed programme return. The operator selects an on-air row,
enables Pan live input and drags the picture of a plate with cropped edges. On pointer release the
Bridge checks a token for the current row, look, fit, producer and engine, and reuses its fitted-plate
batch to apply only the geometry. The input, sound, clip and layer coordinates stay in place.
Additional mask fragments and linked reveals follow the same picture. The focus is kept for that
look and source during the row's Bridge session.

PVW needs the real input picture from C-023. Its focus is local to the preview until Take, with zero
programme writes from dragging. The displayed preview raster and input aspect must be known before
converting pointer coordinates. Neither a Designer poster nor a PVW placeholder substitutes for it.

## Operator review before the picture mapping

Both headers keep Pan visible. PGM disables its action without a selected on-air row or a live
return from the active engine. It continues to obtain eligible plates and apply focus through the
existing scoped Bridge operation.

The PVW action opens a practice-only picture made of colour bars. If a rehearsing template has
Crop edges plates, each practice target follows its existing raster footprint. Otherwise a sample
plate is available. Drag or arrow keys move the image inside the fixed rectangle. The practice state
belongs to the rendered control and is discarded when it closes. It starts no input check, performs
no Bridge writes and cannot become an Inspector draft or reach Take. The real PVW gesture still
requires the active source rectangle and sample aspect ratio from Playout.
