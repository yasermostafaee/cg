# Shared font library (D-126)

## Why

Brand fonts are reused across projects, but today they must be imported into every project separately.
That duplicates bytes and lets projects drift onto different copies of what should be one channel font.

## What changes

- Extend the existing Shared Library with Image and Font import choices.
- Persist shared fonts outside project storage and expose them in every project's font picker.
- Resolve a selected shared font in the Designer canvas and Preview.
- Inline/package shared-font bytes in `.vcg` and single-file HTML exports exactly like project fonts.
- Keep missing or removed shared fonts visible as a validation problem and degrade to a system fallback,
  never a crash.

## Impact

This is a FULL LANE change: it adds persisted storage and bridge channels and changes both export paths.
It does not add a network font service; exported templates remain self-contained and offline-safe.
