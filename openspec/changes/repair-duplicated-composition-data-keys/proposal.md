# Repair duplicated composition Data keys

## Why

Duplicating an authored composition gives its layers and elements fresh IDs. Copied bindings kept
the original element IDs, so the copy could export operator fields with no connected target.

## What changes

- Remap duplicated composition bindings to the copied elements.
- Recover affected projects and packages by dropping bindings to missing local elements and the
  field definitions stranded by those bindings.

## Capabilities

- `designer-dynamic-fields`: preserve the original and copied field ownership and repair legacy copies.

## Impact

Designer composition state and load, shared VCG projection, and CG Control's verified import.
