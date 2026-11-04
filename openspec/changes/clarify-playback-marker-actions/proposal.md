# Change: clarify Playback marker actions

## Why

Content start / Out point and Add / Pin describe implementation details rather than what the two
singleton boundaries do. Their small, long buttons are difficult to scan and operate in the narrow
Inspector.

## What Changes

- Present the boundaries as Hold start and Outro start.
- Use the same short visible Set/Clear verbs with complete accessible names.
- Give all four actions an equal, larger hit area without moving the fixed Info column.
- Keep the timeline marker tooltips to the short phase names.
- When Hold start is first set, seed it one frame before Outro start if no earlier entrance-settle
  frame exists and the active range permits the gap.
- Couple either marker to its partner when a drag crosses the boundary, while still allowing the
  author to place both on one frame.
- Keep both full-height range lines visible when authored boundaries occupy one frame.
- Use the existing semantic green for Hold start's marker/action and the Loop range, keeping the
  playhead/current-frame indicator blue and Outro start orange; do not alter timing semantics.
- Keep the green Loop range legible over colored element rows with a restrained plain fill, no
  diagonal hatch or thick boundary halo, and uncovered green Hold/orange Outro marker colors.
- Keep persisted `contentStart` / `outPoint` fields unchanged.

## Impact

Designer Playback Inspector/timeline copy, lifecycle marker authoring, shared automatic-boundary
resolution and focused deterministic/browser tests.
