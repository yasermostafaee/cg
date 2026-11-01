## Why

Authors build multi-frame compositions as one visual set, but selecting several Live Source plates
currently removes their aspect, fit, poster and frame controls. Applying one treatment therefore
requires repetitive single-plate edits and makes multi-select feel incomplete.

## What Changes

- Add Live Source-only multi-select sections for aspect, keep-aspect, fit, poster, frame stroke and
  stroke width.
- Show a truthful mixed state when the selected plates disagree and apply a committed replacement
  to all selected plates as one undo entry.
- Repair each selected plate against its own declared aspect; keep-aspect stays session-only and is
  never written into the template.
- Give the author-only poster its own fit-whole/fill-frame mode, independent from the on-air live
  picture fit, in both single and homogeneous multi-selection.

## Capabilities

### Modified Capabilities

- `designer-multi-select`: homogeneous Live Source selections expose their shared static appearance
  controls in addition to the registry-driven transform fields.

## Impact

This changes the Designer Inspector, adds one optional backward-compatible scene field and changes
only author-mode poster rendering in the template runtime. It does not change CG Bridge or on-air
live-picture behaviour.
