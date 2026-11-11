# Normalise the selected audio layer

## Why

A sound can have several placements with different roles in the same project. An author needs to normalise one placement, see the adjustment, and remove it from that layer.

## What Changes

- Apply normalisation gain to the selected Sound layer.
- Show its applied gain and estimated levels in the Sound section. Provide Remove normalisation and the normal Designer undo.
- Reuse the original WAV for each placement and apply the authored gain in the shared playback runtime.

## Capabilities

### Modified Capabilities

- designer-audio-element

## Impact

Projects and exported templates carry an optional layer gain. An export with nonzero normalisation gain requires template runtime 1.2.1.
