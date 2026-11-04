# Canvas lifecycle playback

## Why

Ordinary canvas Play used scrub ticks, so time-driven content and Repeater entrances did not run like Preview.

## What Changes

Ordinary forward Play uses runtime play/pause/resume. Root telemetry updates the cursor without scrub feedback. Reverse, Preview loop and ping-pong remain explicit playhead-only tools.

## Capabilities

- Modified: `designer-playout-lifecycle`.

## Impact

Designer renderer and preview document; optional runtime observation only. No persisted data, bridge commands or on-air protocol changes.
