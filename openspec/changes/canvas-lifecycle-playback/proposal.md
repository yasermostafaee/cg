# Canvas lifecycle playback

## Why

The Designer's main canvas and its dedicated Preview currently share the same runtime page but not
the same Play path. Preview calls the runtime lifecycle; the canvas only advances the authoring
playhead and sends repeated scrub messages. Content sources therefore do not start or close the
graphic on the canvas, and intro / hold / outro boundaries can disagree between the two surfaces.

## What changes

- Make ordinary forward Play on the canvas call the same runtime `play` / `pause` / `resume`
  lifecycle used by Preview.
- Reflect the root runtime frame back into the Designer playhead and settle the transport when the
  runtime completes naturally.
- Keep manual scrub, reverse playback, Preview loop and ping-pong as explicit playhead-only
  authoring tools; they continue to position media without starting content-driver lifecycles.
- Prevent runtime-owned frame reports from feeding back as scrub commands.
- Re-arm the canvas lifecycle after a natural completion so a later Play starts a fresh run.
- Keep the visible Canvas cursor authored-time based when an empty/static root has no
  frame-dependent paint, so Runtime's intentional collapsed render leg is not exposed as an
  instantaneous entrance-to-end jump.
- Reuse that authored Intro/Hold/Outro projection in the dedicated Preview for empty/static roots,
  so Freeze, Middle loop, finite completion and replay agree between both authoring surfaces.

## Impact

Designer renderer session state, the shared Designer preview iframe bridge, focused DOM/E2E tests,
and the `designer-animation-timeline` / `designer-playout-lifecycle` specifications. Stored scene
timing, exported templates and on-air protocol behaviour do not change.
