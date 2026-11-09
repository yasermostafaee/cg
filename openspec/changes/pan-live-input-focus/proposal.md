# Pan a cropped live input (D-178)

## Why

A `cover` fit can crop a face, logo or burned-in caption at the wrong edge. Operators need to choose
which part of the live input stays visible while the plate and picture proportions stay fixed.

## What Changes

- Support a normalized focus for the overflowing axis of a Live Source plate.
- Carry it per look and use the one shared fit calculation for the authoring poster and Bridge geometry.
- Keep existing files byte-for-byte centred when the field is absent; ignore focus under `contain`.
- Keep Pan in PVW with a proportional guide on the active Crop edges plate and offer Centre.
- Save the crop for its row, look, plate and assigned input when Bridge can verify the geometry.
- Use the saved crop in the normal Take before revealing the source. Keep the PVW safety interlock.
- Defer the PGM operator control until an in-place editor can show the uncropped source.
- Show the actual source in the PVW editor when Playout supplies the source picture mapping.

## Capabilities

### Modified Capabilities

- `designer-live-source`
- `runtime-live-source-routing`

## Impact

Shared scene/carrier schemas, VCG export, Designer fit controls, CG Control monitors and Caspar Bridge
live-source geometry.
