# Export named template variants (D-211)

## Why

Changing the proposed VCG name currently still replaces the original composition template on import.

## What Changes

- Keep the base package id at the suggested filename.
- Derive an independent package id and visible template name from a deliberately changed VCG name.

## Capabilities

### Modified Capabilities

- designer-composition-export

## Impact

Derive the variant after the picker returns the actual name, using a separate SHA-256 namespace keyed by the scoped composition id and a normalized, case-insensitive basename. Keep the authoring document untouched. A file renamed outside Designer retains its package identity. Browser downloads that offer no save dialog retain the base id.
