# Design: Empty versus legacy image choices

## Compatibility rule

The persisted shape already carries the discriminator needed for a migration-free fix:

- `inputMode` absent and `assetOptions` absent is a legacy field; it keeps the historical implicit
  set of every packaged image.
- `inputMode` present and `assetOptions` absent or empty is a modern authored field whose allowlist
  is empty.
- `assetOptions` present and non-empty remains the exact authored subset and order.
- upload-only mode exposes no choice list.

Every field projection must use this same rule. Packaging writes an explicit empty `assetOptions`
for modern choice-capable fields, so CG Control never needs to infer author intent from the package
asset inventory.
