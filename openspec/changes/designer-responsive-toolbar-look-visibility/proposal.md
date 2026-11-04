# Change: Keep narrow Designer controls truthful and contained

## Why

At a supported narrow window width the Canvas tool strip can overflow into the Inspector. Registered
Look rows also expose an ordinary visibility eye even though the one-of-N Look picker immediately
overrides that authored value. Both surfaces therefore present controls outside the layout or state
model they belong to.

## What Changes

- Collapse non-essential Canvas tools into a labelled menu when the Canvas area itself is narrow.
- Keep the complete ordered toolbar at wider Canvas widths.
- Remove Hide/Show from registered Look-instance rows while preserving Lock and ordinary child-layer
  visibility controls.
- Give registered Looks a shared icon and restrained type accent distinct from ordinary compositions
  in the Compositions panel and Timeline; keep headings/names neutral and remove the user-facing
  default designation because the operator selects the active Look before Take.
- Make the Compositions panel the single Look lifecycle surface: ordinary compositions stay above a
  separate Looks section with icon-only add and group-remove actions; Inspector keeps actionable
  source status but omits permanent empty/help copy.
- Cascade deletion across a registered Look, its home instance and backing composition, whichever
  representation initiated it; confirm before removing a non-empty multi-frame group.
- Let the author switch registered Looks inside Preview without mutating the stored project or the
  authoring-canvas selection, and omit empty composition/Look namespaces from Preview Variables.

## Impact

- Designer Canvas header, Compositions panel, Inspector, timeline rows and Preview workspace; no
  scene or package schema change.
- Adds focused Chromium coverage for the minimum supported width and extends the Looks acceptance
  walk.
