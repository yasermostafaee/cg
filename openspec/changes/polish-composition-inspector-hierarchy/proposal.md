# Change: Clarify composition Inspector controls and hierarchy

PRD: `B-373`, `B-374`, `D-184` in `docs/prd/bugs-designer.md` and
`docs/prd/designer.md`.

## Why

The composition lifecycle group is labelled like an external Playout connection, composition size
uses an older W/H layout than element size, and expanded property groups do not visually contain
their rows. These small inconsistencies make the authoring hierarchy harder to scan.

## What changes

- Rename the visible composition lifecycle group from **Playout** to **Playback**.
- Render composition width and height with the shared paired-vector control, with W/H inside the
  input segments.
- Indent expanded Inspector bodies and timeline property rows by a consistent visual step.

Internal `playout` schema names and runtime semantics do not change.

## Impact

- Affected capability: `designer-inspector`.
- Affected UI: composition Inspector, shared Inspector disclosure body, timeline property labels.
- No schema, export, runtime or on-air change.
