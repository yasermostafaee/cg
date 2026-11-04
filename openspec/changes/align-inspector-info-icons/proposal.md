# Align Playout Inspector info icons (B-370)

## Why

Contextual help reduced persistent prose, but the resulting icons landed beside labels of different
lengths and produced a ragged Inspector.

## What Changes

- Give Playout rows with help one fixed final icon column.
- Keep label, value and action columns independent of help placement.
- Preserve every existing help dialog and authoring action.

## Impact

Designer presentation only; no scene, runtime or export contract changes.
