# Design — pan a cropped live input (D-178)

## One value, one geometry function

`cropFocus = {x,y,zoom?}` stores each position normalized to `0..1` and an optional magnification
from `1` (the largest cover crop) to `8`. Absence resolves to centred, unzoomed cover. For `cover`,
the magnification uniformly scales the picture and its origin remains
`box.origin + (box.size - picture.size) * focus`. `contain` ignores the whole framing value.
The editor derives its source window from the same fit that computes FILL. CLIP stays fixed.

The value lives on the plate element without a look group and beside each look's rect/fit maps when a
look group exists. The Bridge resolves the active look and passes the value into `fitPictureToBox` via
`liveSourceFit`; no consumer re-derives crop arithmetic.

## Compatibility

All fields are optional. Old scenes, packages and persisted template records parse unchanged. Missing
focus produces exactly the old centred crop. Schema bounds reject values outside the source frame.

## Operator surface

The Designer Inspector has no crop-focus editor. Previously authored values remain readable in the
scene and on export. The CG Control gesture targets a visible `cover` plate. Movement is clamped
to axes with crop travel and keeps the authored plate fixed. Drag a corner to resize the window
around the opposite corner. At the picture bounds the window shifts only as far as needed to fit.

PVW can draft normalized focus for a source whose aspect and fit Bridge has resolved. Dragging
and resizing affect the browser preview immediately. Off-air Update saves framing for Take.
Update on air applies framing to the verified seated source.

## Picture and guide geometry

The [2.18.17 handoff](../../../docs/integration/playout/source-previews-2.18.17-adoption.md) supplies
an active rectangle, transform and sample aspect ratio paired with the source JPEG. Bridge forwards
normalized active bounds only for a frame with known source SAR, full visible coverage, explicit
zero source and applied rotation, and agreement between the transformed visible rectangle and the
delivered active rectangle. It derives display aspect from the visible raster and SAR. The frame's
source, producer and geometry determine a stable revision independent of sample sequence.

The verified axis-aligned transform makes positions normalized within the active JPEG rectangle
equivalent to positions normalized within the visible source. The browser clips delivery padding
and draws the active picture at its display aspect. Pan uses that picture only when the active
Bridge target matches its source and aspect. A producer or geometry change cancels the in-progress
gesture. A new sample at the same revision updates the JPEG without reinitializing the gesture.
Draft identity continues to come from the existing Take token. The legacy MJPEG is outside this
mapping. Acceptance with a real input on the target station is still open.

Without a usable JPEG mapping, Pan shows proportional Bars. With no visible Crop edges plate it
has no editing surface. The crop guide keeps its selected pixels clear, with checkerboard over the
excluded source area. It has the authored plate ratio and a blue outline with a dark contrast edge.
Drag or arrow keys move it along the axes with travel. Center restores
the centre at the current size. Drag, resize and Center stage an
Inspector draft that survives toggling PVW. With no eligible Bridge target, Update applies practice
framing in the current browser session. Discard restores the last applied position. Practice starts
no input check and performs no Bridge writes.

## Save a PVW crop for Take

Bridge reads eligible Crop edges plates from the same resolved seating plan used by Take. A target
token binds the crop to the row, look, plate, input and fit geometry. Drag or Center makes an
Inspector draft during rehearsal. It survives OFF PVW and is available on return. Update saves the
drafts together after validating them against the current plan for each Look. It can run after
leaving PVW while the row is off air. Bridge leaves the mixer and input transport alone. The saved
crop applies to the first seating plan of the matching Take. A stale target refuses the crop batch.
Missing or mismatched JPEG geometry retains the Bars guide. An unresolved Take target keeps the
guide in local practice.

Legacy rehearsal requires OFF PVW before PLAY. Independent PVW can stay open during Take. A saved
Center is explicit centred focus for that crop, including on a plate with a different authored default.

The console treats the crop route as an optional capability. The target also advertises support
for saving resize edits. A target without it still supports positional Pan. An older Bridge without the route keeps the practice
guide available and explains inside Pan that Update keeps the position for local practice. Required routes still use the
global compatibility check.

## Apply a PVW crop to programme

Update on air opts into applying the verified crop on the live row. Bridge rechecks the crop token,
look, input, geometry and owned seats under the row's seat lock. It computes the new FILL from the
same fit and sends FILL directly to the already seated source. The clip, producer and volume stay
in place. Direct FILL avoids committing another operation's staged mixer commands. Bridge validates
the full batch before sending and records it only after primary acknowledgements. On refusal it
attempts to restore the touched fills that still belong to the row, and the draft remains available.
Pan rechecks the target after a Take settles while the preview remains open. A normal off-air Update
only records framing for Take.

## In-place PGM editor deferred

The owner approved the in-plate PVW editor and deferred the PGM control. CG Control does not show
a Pan button or crop overlay in PGM. The relative crop operation remains available to existing
CG Control 1.1.0 installations through its original scoped Bridge contract.

An equivalent PGM editor would need an authenticated read of the already-open source before FILL,
CLIP and the final programme mix. The programme return carries only the on-air composite.

The source and box use a shared raster when deriving the crop. A wider source overflows
horizontally at the largest crop. A narrower source overflows vertically. A matching aspect uses
the whole picture at that size, even when the source raster has fewer pixels than the plate.
Resizing inward creates travel on both axes, including for a matching aspect.
