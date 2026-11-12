# Pan a cropped live input (D-178)

## Why

A `cover` fit can crop a face, logo or burned-in caption at the wrong edge. Operators need to choose
which part of the live input stays visible while the plate and picture proportions stay fixed.

## What Changes

- Support a normalized focus for the overflowing axis of a Live Source plate.
- Carry it per look and use the one shared fit calculation for the authoring poster and Bridge geometry.
- Keep existing files byte-for-byte centred when the field is absent; ignore focus under `contain`.
- Keep Pan in PVW with a proportional guide on the active Crop edges plate and offer Centre.
- Show the fitted assigned preview picture in Pan. Fill unused plate margins with opaque checkerboard
  and dim the image outside the selection while moving or resizing the crop.
- Draft crop changes in PVW and apply them with Inspector Update for the matching row, look, plate and input.
- Save off-air drafts for the first Take. Apply a verified on-air draft to the existing seat on Update on air.
- Defer the PGM operator control until an in-place editor can show the uncropped source.
- Show the actual source in the PVW editor when Playout supplies the source picture mapping.
- Let the operator resize the crop from any corner while preserving its aspect and plate.
  Stage size with position through the same Inspector Update and Take.
- Let the operator stage the current preset's authored framing with **Reset crop** in Inspector.

## Capabilities

### Modified Capabilities

- `designer-live-source`
- `runtime-live-source-routing`

## Impact

Shared scene/carrier schemas, VCG export, Designer fit controls, CG Control monitors and Caspar Bridge
live-source geometry.
