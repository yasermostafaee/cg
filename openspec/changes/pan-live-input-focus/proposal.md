# Pan a cropped live input (D-178)

## Why

A `cover` fit can crop a face, logo or burned-in caption at the wrong edge. Operators need to choose
which part of the live input stays visible while the plate and picture proportions stay fixed.

## What Changes

- Support a normalized focus for the overflowing axis of a Live Source plate.
- Carry it per look and use the one shared fit calculation for the authoring poster and Bridge geometry.
- Keep existing files byte-for-byte centred when the field is absent; ignore focus under `contain`.
- Scope the proposed editing surface to direct dragging on real PGM/PVW pictures in CG Control.
  PVW needs the D-177 live preview contract.

## Capabilities

### Modified Capabilities

- `designer-live-source`
- `runtime-live-source-routing`

## Impact

Shared scene/carrier schemas, VCG export, Designer fit controls, CG Control monitors and Caspar Bridge
live-source geometry.
