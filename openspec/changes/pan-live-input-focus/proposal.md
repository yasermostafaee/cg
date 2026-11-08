# Pan a cropped live input (D-178)

## Why

A `cover` fit can crop a face, logo or burned-in caption at the wrong edge. Authors need to choose
which part of the source remains visible without changing the plate or stretching the picture.

## What Changes

- Add an optional normalized X/Y crop focus to a Live Source plate.
- Author it as percentages in the Designer Inspector when `cover` is selected.
- Carry it per look and use the one shared fit calculation for the authoring poster and Bridge geometry.
- Keep existing files byte-for-byte centred when the field is absent; ignore focus under `contain`.

Direct dragging on a meaningful PVW/PGM picture is not invented here because D-177 still has no
bounded Playout preview-picture contract. The owner explicitly accepted an Inspector section as the
alternative authoring surface.

## Capabilities

### Modified Capabilities

- `designer-live-source`
- `runtime-live-source-routing`

## Impact

Shared scene/carrier schemas, VCG export, Designer Inspector and poster preview, template runtime,
and Caspar Bridge live-source geometry.
