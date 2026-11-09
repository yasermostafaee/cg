## Decisions

The fallback is an opaque graphics-bed pixel directly under the externally composited live producer. This makes loss/resume automatic: an opaque picture covers it and an empty/transparent picture reveals it, without polling or another producer layer.

The Designer uses one fallback picker for both single and multiple selection. New plates store
Bars, and the Bars choice includes its thumbnail. Existing plates keep their authored fallback.
Legacy `posterAssetId` scenes keep their picture, and an older plate without a fallback or poster
resolves to Bars.

The fallback covers the authored plate bounds. The Bridge sends the resolved `{aspect, mode}` facts
on take, look switch, binding update and swap. It owns live-picture `MIXER FILL`/`CLIP`, source
availability and the layer lifecycle.

Local CasparCG 2.5.0 showed the solid fallback when a routed layer had no frame, the margin around
a contained source, and the fallback on a preset whose distinct producer was a UDP input without a
sender. Resuming the routed input covered the fallback without retaking the graphic.

An emergency replacement on the same layer can receive `202 PLAY OK` before the new input has
its first frame. The engine's transition producer can keep drawing the outgoing picture in that
case. Reliable detection needs an input signal/first-frame report. A black picture can be valid.
[CasparCG 2.5.0 transition producer](https://github.com/CasparCG/server/blob/v2.5.0-stable/src/core/producer/transition/transition_producer.cpp)

## Fractional output edges

In the reported `chan-ghab` Look, the 1080-line raster has a plate from y=116.5 through
y=963.5. CEF paints the fallback through raster row 963. The old fractional FILL/CLIP leaves that
row exposed. The live return showed the same seven Bars hues as the authored fallback.
[CasparCG's output transforms](https://github.com/CasparCG/server/blob/v2.5.0-stable/src/accelerator/ogl/util/transforms.cpp#L84-L103)
turn the clip into output geometry.

For a full-coverage plate, Bridge aligns edges near pixel centres and then fits the source with
the same aspect and focus. It computes width and height from those edges and keeps ordinary
fractional edges at their authored coordinates.
Continuous geometry still supplies crop identity and eligibility. The correction applies to the
main seating path for unmasked, unlinked plates. Intentional contain margins and authored mask
boundaries retain their continuous coordinates.

A separate local CasparCG 2.5.0 fixture at 1080i5000 reproduced Bars in row 963 with the old
commands. With the aligned commands, that row contained only the source colour, and row 964
still contained the scene outside the plate.

## Preset switch

The programme page enters the next Look before Bridge commits the external producer geometry.
An affected plate's opaque background could therefore appear in its entering position while
its picture was still in its outgoing position. A local CasparCG 2.5.0 fixture sampled both
positions and reproduced the newly exposed fallback colour at that boundary.

The per-look carrier lists plates whose fallback paints on air. When the fitted coverage
changes, the normal look update also holds the affected fallback pixels. After a confirmed
primary mixer commit and an output tick, Bridge releases that hold. The release carries the
same identity so a late release cannot undo a newer switch. The page has a bounded recovery
timer. Unchanged plate geometry and older carriers keep the ordinary switch path.

The hold only affects fallback children on the programme page. Foreground, rehearsal and
other authored artwork keep their existing behavior. When a settled producer is genuinely
empty, the chosen fallback is visible again. A current page rebuild or template reload
supplies the updated carrier for existing packages.

## Risk

This changes on-air page pixels and the Bridge control payload, so it still requires a real CasparCG/Playout pass in addition to mocks.

## PVW

Designer shows the selected background even if Show fallback on air is off. The retained template
page supplies the plate's fallback in PVW. CG Control identifies its local rehearsal frame so the
page draws the background there and applies the saved flag in the programme output. PVW retains the
normal output render mode. A rebuilt retained page adopts the behavior when its source package is
available. The PVW overlay adds a transparent outline and labels using the per-channel override and
active-look fit.
