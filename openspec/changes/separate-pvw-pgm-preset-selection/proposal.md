# Keep preview and programme preset selections independent

## Why

Designer row presets dropped an Inspector preview cue after the programme acknowledgement,
while New live layout row presets did not. Preview also lost its cue when rehearsal stopped.
The same operator actions therefore had different results after repeated picks and state changes.

## What Changes

- Keep one local preview preset per row, shared by the Inspector and PVW.
- Row buttons choose the first programme preset off air and switch programme directly on air.
- Preserve preview across row preset/Focus requests, acknowledgements and rehearsal toggles.
- Label row actions `PGM · FIRST` or `PGM · NOW`; keep existing on-air and PVW indicators separate.

## Impact

Runtime draft cue storage, Inspector selection, row controls, PVW seeding and regressions.
No source-preview transport change and no change to explicit Update behavior.
