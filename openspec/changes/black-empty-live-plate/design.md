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

## Risk

This changes on-air page pixels and the Bridge control payload, so it still requires a real CasparCG/Playout pass in addition to mocks.

## PVW

Designer shows the selected background even if Show fallback on air is off. The retained template
page supplies the plate's fallback in PVW. CG Control identifies its local rehearsal frame so the
page draws the background there and applies the saved flag in the programme output. PVW retains the
normal output render mode. A rebuilt retained page adopts the behavior when its source package is
available. The PVW overlay adds a transparent outline and labels using the per-channel override and
active-look fit.
