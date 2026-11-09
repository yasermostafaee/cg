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
scene and on export. The planned CG Control gesture targets the visible `cover` plate on its source
picture. Movement is clamped to the overflowing axis and keeps the authored plate fixed.

PVW needs the real input picture from C-023. Its focus is local to the preview until Take, with zero
programme writes from dragging. The displayed preview raster and input aspect must be known before
converting pointer coordinates. Neither a Designer poster nor a PVW placeholder substitutes for it.

## Operator review before the picture mapping

The PVW action opens a practice-only picture inside a visible Crop edges plate. A preset with no
such plate has no practice surface. The whole practice source retains its aspect ratio within
the available footprint. The shaded crop guide has the authored plate ratio and a blue outline
with a dark contrast edge. Drag or arrow keys
move it along the overflowing axis, and Center restores its starting position. The practice state
belongs to the rendered control and is discarded when it closes. It starts no input check, performs
no Bridge writes and cannot become an Inspector draft or reach Take. The real PVW gesture still
requires the active source rectangle and sample aspect ratio from Playout.

## PGM deferred

The owner approved the in-plate PVW editor and deferred the PGM control. CG Control does not show
a Pan button or crop overlay in PGM. The relative crop operation remains available to existing
CG Control 1.1.0 installations through its original scoped Bridge contract.

An equivalent PGM editor would need an authenticated read of the already-open source before FILL,
CLIP and the final programme mix. The programme return carries only the on-air composite.

The source and box use a shared raster when deriving the crop. A wider source overflows
horizontally. A narrower source overflows vertically. A matching aspect uses the whole picture
even when the source raster has fewer pixels than the plate.
