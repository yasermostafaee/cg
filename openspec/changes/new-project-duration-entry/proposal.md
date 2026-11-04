# Change: Enter a new project's duration in seconds or frames

PRD: `D-183` in `docs/prd/designer.md`.

## Why

The New Project dialog accepts only Total frames. Authors who know that a graphic should last ten
seconds must calculate the frame count themselves, even though the dialog already knows the frame
rate.

## What changes

- Add an editable Duration field in seconds.
- Keep Duration and Total frames synchronized through the selected frame rate.
- Quantize seconds to an integer frame count and show the exact nearest-frame duration.

## Impact

- Affected capability: `designer-shell`.
- Affected UI: New Project dialog only.
- The stored scene still carries the existing integer `durationFrames`; no schema change.
