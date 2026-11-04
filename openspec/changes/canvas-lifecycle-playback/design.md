# Design — canvas lifecycle playback

## Root cause

`TransportBar` owns a local `requestAnimationFrame` loop. It increments `currentFrame`, and
`CanvasArea` forwards every change as `action: 'scrub'`; the iframe calls `runtime.tick(frame)`.
The canvas never sends `play`, `pause`, `resume` or `stop`, so ticker / sequence / clock drivers and
the playout controller never enter their real lifecycle.

## Decision

The transport has two explicit session-only paths:

1. **Lifecycle path** — ordinary forward Play while Preview loop and ping-pong are off. The canvas
   sends the same controls as Preview. The runtime owns timing and reports its root frame through
   the existing `onRootFrame` hook.
2. **Playhead path** — reverse play, Preview loop and ping-pong. The existing authoring rAF and
   scrub stream remain because these tools intentionally support reverse and bounce motion that
   the broadcast lifecycle does not model.

The store records which path is active. A root-frame report updates the visible playhead, but
`CanvasArea` labels the resulting message runtime-owned so the iframe updates frame-offset state
without calling `runtime.tick` back into the active controller. A natural `stop.end` clears the
transport state. Pause preserves the lifecycle path so the next Play sends `resume`; completion
clears it so the next Play sends a fresh `play`.

## Scene edits during a run

The canvas iframe is an authoring surface and can receive `scene-replace` while active. A rebuild
must not leave the host claiming playback while the new runtime is static. The iframe retains the
canvas lifecycle state and restarts the rebuilt authoring runtime with the current field values;
the dedicated Preview behaviour remains unchanged.

## Empty/static root display clock

Runtime deliberately collapses a leg that has no keyframe, lifespan or media-driven paint. That is
the correct rendering optimisation, but its boundary-only root telemetry is not a useful authoring
cursor. During ordinary lifecycle Play, the host therefore gives an empty/static root a display-only
clock derived from authored elapsed time. It updates `currentFrame` without sending scrub ticks,
ignores the collapsed root-frame boundary for the visible cursor, pauses and resumes with the
lifecycle session, and resets at a genuinely fresh Play. A root with frame-dependent paint keeps
using Runtime telemetry. Runtime, exported output and on-air timing are unchanged.

## Dedicated Preview parity

The dedicated Preview uses the same authored-frame projection for an empty/static root. Its elapsed
counter retains the product rules: a plain finite scene caps at authored duration, Manual Middle
loop and infinite cycles remain open-ended, and Auto-out / finite loop-cycle include authored Hold
and delay. If Runtime reports a natural stop before a collapsed static leg's authored finite display
duration, Preview defers only the host counter's stop until that projection completes. Explicit Stop
still resets immediately. Roots with real animation, lifespan, media or content-driven ownership
continue to use Runtime telemetry without projection.

## Gallery integration regression contract

Real Repeater entrance/exit drivers run through this same ordinary canvas lifecycle, including
staggered row poses, Pause/Resume and replay. Runtime observers remain optional and read-only;
observer exceptions cannot alter broadcast playback. The integrated current-Designer/gallery
snapshot is validated separately in `reconcile-current-designer-gallery`, not by reusing either
source branch's earlier green checks.

## Non-goals

- No persisted transport state.
- No change to stored playout mode, hold source, timing or export metadata.
- No attempt to make reverse / bounce a broadcast lifecycle.
- No repaint or artificial delay added to Runtime for an empty/static scene.
