# Change: Inspector contextual help

## Why

The narrow Designer Inspector is dominated by instructional paragraphs. Authors need the controls
and current state on every visit, but need the longer teaching only occasionally.

## What Changes

- Keep concise Playout group and state labels inline.
- Move marker, ownership, delay and hold-loop explanations into the existing click-to-read Info modal.
- Keep genuine errors and blocking states visible.

## Impact

- Affected PRD: D-181.
- Affected UI: Designer Playout Inspector and its shared Info affordance.
- No schema, export or runtime contract changes.
