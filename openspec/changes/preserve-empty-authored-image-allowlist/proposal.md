# Change: Preserve an empty authored image allowlist

## Why

When an author selects an explicit image input mode but checks no allowed images, Preview/CG Control
can silently offer every packaged image. Choosing any one picture makes the restriction start
working, proving the empty and absent states are being conflated.

## What Changes

- Treat an explicit modern image mode with no options as an empty allowlist.
- Keep the historical all-packaged-images fallback only for legacy fields with no `inputMode` key.
- Apply the same rule to scalar fields, Repeater columns and generated workbook schemas.

## Impact

- Affected PRD: B-413; follow-up to B-407.
- Modified capability: `designer-dynamic-fields`.
- Affected packages: `@cg/shared-schema`, `@cg/designer`.
