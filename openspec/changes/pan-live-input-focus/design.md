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
move it along the overflowing axis, and Center restores the centre. Drag and Center stage an
Inspector draft that survives toggling PVW. Update applies practice framing in the current browser
session. Discard restores the last applied position. Practice starts no input check and performs
no Bridge writes. The real PVW gesture still requires the active source rectangle and sample aspect
ratio from Playout.

## Save a PVW crop for Take

Bridge reads eligible Crop edges plates from the same resolved seating plan used by Take. A target
token binds the crop to the row, look, plate, input and fit geometry. Drag or Center makes an
Inspector draft during rehearsal. It survives OFF PVW and is available on return. Update saves the
drafts together after validating them against the current plan for each Look. It can run after
leaving PVW while the row is off air. Bridge leaves the mixer and input transport alone. The saved
crop applies to the first seating plan of the matching Take. A stale target refuses the crop batch.
Unknown geometry offers only the generic practice guide.

The row's existing interlock still requires OFF PVW before PLAY. A saved Center is explicit centred
focus for that crop, including on a plate with a different authored default.

The console treats the staging route as an optional capability. An older Bridge keeps the practice
guide available and explains inside Pan that Update keeps the position for local practice. Required routes still use the
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
