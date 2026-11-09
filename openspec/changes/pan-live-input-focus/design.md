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

PVW can save normalized focus for a source whose aspect and fit Bridge has resolved. The current
guide displays that aspect and labels the absence of a live picture. Programme writes begin on
the existing Take path after the operator exits rehearsal. The full source picture needs the
active rectangle and pixel aspect ratio from Playout.

## Operator review before the picture mapping

The PVW action opens a practice-only picture inside a visible Crop edges plate. A preset with no
such plate has no practice surface. The whole practice source retains its aspect ratio within
the available footprint. The shaded crop guide has the authored plate ratio and a blue outline
with a dark contrast edge. Drag or arrow keys
move it along the overflowing axis, and Center restores its starting position. The practice state
belongs to the rendered control and is discarded when it closes. It starts no input check, performs
no Bridge writes and cannot become an Inspector draft or reach Take. The real PVW gesture still
requires the active source rectangle and sample aspect ratio from Playout.

## Save a PVW crop for Take

Bridge reads eligible Crop edges plates from the same resolved seating plan used by Take. A target
token binds the crop to the row, look, plate, input and fit geometry. Stage an edit only during
rehearsal. Saving updates the row and leaves the mixer and input transport alone. The stage is
available when returning to Pan and applies to the first seating plan of the matching Take. A stale
target cannot set a crop on a different input. Unknown geometry offers only the generic practice guide.

The row's existing interlock still requires OFF PVW before PLAY. A saved Center is explicit centred
focus for that crop, including on a plate with a different authored default.

The console treats the staging route as an optional capability. An older Bridge keeps the practice
guide available and explains inside Pan why saving is unavailable. Required routes still use the
global compatibility check.

## PGM deferred

The owner approved the in-plate PVW editor and deferred the PGM control. CG Control does not show
a Pan button or crop overlay in PGM. The relative crop operation remains available to existing
CG Control 1.1.0 installations through its original scoped Bridge contract.

An equivalent PGM editor would need an authenticated read of the already-open source before FILL,
CLIP and the final programme mix. The programme return carries only the on-air composite.

The source and box use a shared raster when deriving the crop. A wider source overflows
horizontally. A narrower source overflows vertically. A matching aspect uses the whole picture
even when the source raster has fewer pixels than the plate.
