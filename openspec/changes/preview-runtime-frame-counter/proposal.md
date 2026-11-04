# Preview runtime frame telemetry

## Why

A wall clock alone cannot describe an authored hold, loop or outro.

## What Changes

Expose an optional read-only root-frame observer, forward deduplicated Preview iframe reports, and display them beside elapsed time. Static roots retain an authored display projection.

## Capabilities

- Modified: `designer-preview`.

## Impact

Designer renderer and preview document; optional runtime observation only. No persisted data, bridge commands or on-air protocol changes.
