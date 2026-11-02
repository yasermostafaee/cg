## Why
The automatic `live-N` handle and small authoring label do not read as the numbered frame the author is arranging.

## What Changes
- Generate `plate-N` for newly drawn Live Sources.
- Increase the authoring label's visual weight.
- Preserve existing ids without migration.

## Capabilities
### Modified Capabilities
- `designer-live-source`

## Impact
Designer id generation, template-runtime author mode, and tests.
