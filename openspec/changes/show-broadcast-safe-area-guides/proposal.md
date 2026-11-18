# Broadcast safe-area guides

## Why

Designers and operators need a broadcast-safe composition reference while editing
and rehearsing graphics, without adding guide marks to the actual template or PGM.

## What changes

- Add default-off Safe areas toggles to the Designer canvas header and CG Control PVW header.
- Show Action 93% and Graphics 90% outlines using EBU R95 note 5, with whole-raster
  rounding matching the HD examples of SMPTE ST 2046-1.
- Fit guides to the active raster through zoom, pan, resizing and monitor letterbox.
- Keep guide visibility session-only and outside all template/preview iframe pages.

## Impact

Visual UI only: two local view toggles and a shared pure display-geometry helper.
No persisted keys, scene migrations, output/export changes or Bridge commands.
