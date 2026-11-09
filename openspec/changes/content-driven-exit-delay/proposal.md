# Content-driven exit delay

## Why

A clock can switch from its digits to an announcement at zero. The author needs to keep that
announcement visible for a set duration and then run the graphic's Outro automatically.

## What changes

- Store an optional `contentEndDelayMs` on the composition. Its absence means zero.
- Author **Exit delay** in the Playback Inspector for effective Content-driven Auto-out and
  Loop cycle holds.
- Start the timer after all enabled drivers complete. Keep the composition in Hold during that
  interval, then run its normal automatic exit.
- Use the saved value in Designer Rehearse and exported graphics. Surface it in exported playout
  metadata for consumers that read the authored timing.

## Impact

Designer Playback, scene parsing, export metadata and the shared runtime lifecycle. CG Control
uses the exported graphic's existing self-end signal.
