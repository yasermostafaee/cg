# Count template operator fields

## Why

Template Details and catalogue rows use the number of root fields. Nested live-frame titles
already appear in the Inspector, so the catalogue can report zero for a template with fields.

## What changes

Use the registered field tree and shared title paths to count the template's operator fields.

## Capabilities

- `runtime-template-library`: report the operator field count in the catalogue and Details.

## Impact

CG Control template picker and template catalogue.
