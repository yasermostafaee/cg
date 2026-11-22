## Why

B-446: an exported text field carried Required, but CG Control accepted a blank
update. The form only gated staged text against a pattern. The authored field
description travelled in the package without an operator surface.

## What Changes

- Check authored constraints before applying a staged field update. Report the
  refused field and preserve its draft and the currently applied values.
- Show authored descriptions on demand in the Control Inspector and explain
  their destination beside the Designer's Description control.

## Capabilities

- Modify `runtime-ui` and `designer-dynamic-fields`.

## Impact

Designer preview validation, Control Inspector and Update, the Bridge update
guard and the offline simulation. Existing VCG fields carry the same metadata.
