## Why

B-437. Static compositions can play a video or Lottie using a saved Hold behavior, while Playback currently hides that choice without an Outro marker. This obscures the difference between a media repeat and the timeline transport's Preview loop.

## What Changes

- Expose the existing composition-owned Freeze and Loop media choices in Playback for Static compositions with visible Video or Lottie.
- Offer media membership under Loop so individual clips can play through once.
- Explain what repeats and where the setting applies. Follow layers use the composition's Hold behavior.

## Capabilities

### Modified Capabilities

- `designer-playout-lifecycle`

## Impact

Designer Playback and its browser verification. The controls use the existing authored Hold settings and runtime media playback.
