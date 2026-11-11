# Keep the panel restore control neutral

## Why

The fullscreen restore icon and active Pan button appear in the same accent. Use the standard
icon treatment for the fullscreen control so the accent identifies the active tool.

## What Changes

- Use the same neutral treatment for fullscreen and restore in every shared panel.
- Keep the restore icon, accessible state and workspace action.

## Impact

- Affected spec is `runtime-ui`.
- Affected code is the CG Control Panel and its Playwright layout coverage.
