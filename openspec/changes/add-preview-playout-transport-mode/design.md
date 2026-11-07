# Design — Preview playout transport mode

## Current seams

The bottom Canvas transport currently owns two different playback mechanisms:

- `playhead` advances `currentFrame` locally for ordinary stepping, reverse, Preview loop and
  Ping-pong. `CanvasArea` forwards those frames as static `scrub` messages.
- `lifecycle` sends `play` / `pause` / `resume` to the Canvas preview iframe. The iframe already
  exposes the same `next` and `stop` commands used by the dedicated Preview modal and exported
  template runtime.

`timelinePlaybackMode` and `timelinePlaying` are session-only Designer state. No transport state is
serialized into the scene or undo history.

## Mode ownership

The new **Rehearse** switch is local to the mounted Canvas transport. It defaults off and is
reset when the edited composition changes or the transport unmounts. Switching either direction:

1. stops any active lifecycle rehearsal,
2. settles the session transport,
3. returns the playhead to the active range start, and
4. leaves the scene, keyframes, lifecycle markers and authored settings untouched.

The authoring Preview-loop selection is also cleared on a mode switch so a hidden preview-only mode
cannot silently affect playback after the switch is turned off.

## Mutually exclusive controls

With Rehearse off, the existing start, step-back, Play/Pause, step-forward, Preview loop and
Ping-pong controls remain visible. Forward Play uses only the local `playhead` clock; a new run starts
at the active range start and proceeds linearly to its end unless the author explicitly enables
Preview loop or Ping-pong. It never invokes lifecycle hold, Next or Outro.

With Rehearse on, those authoring controls are replaced by momentary **Play**, **Next** and
**Stop** commands. Play enters the existing `lifecycle` path; Next and Stop are delivered to the
Canvas iframe through a small session-only command receiver registered by `CanvasArea`. Next is
disabled when the canonical `hasNextStep(scene, scene.compositions)` predicate is false. Play is
disabled while the lifecycle is already running, because a second click would otherwise present a
command that the current store state cannot route as a new action.

Stop uses the dedicated Preview's **Stop and clear** contract: it runs the coordinated Outro from
the current lifecycle position. When a root element has an authored keyframe strictly after Out
point, the timeline cursor advances across that real Outro span at the scene frame rate while it is
visible. When no such visual Outro exists, Runtime is allowed to clear immediately and the cursor
settles directly at the active range end; it must not run a competing synthetic clock. The built-in
folder-backed Quran picture Sequence now authors its own 100→160 opacity Outro. Runtime preserves
any Sequence whose root has such post-Out keyframes instead of including it in Stop's blanket
content hide, so the current text, picture or nested composition remains mounted while those
keyframes close it. Page changes and their `transitionOut` remain Sequence-owned and do not count as
a composition Outro by themselves. The Canvas picture settles blank only after `stop.end`.
Turning Rehearse off explicitly restores the authoring picture; neither action changes the project.

The physical J/K/L authoring shortcuts are inactive in Rehearse mode. Hidden frame-step
controls therefore have no hidden keyboard equivalent.

## Copy

The two authoring-loop tooltips use only their short names: **Preview loop** and **Ping-pong**. The
long explanatory text belongs in documentation, not a repeatedly-read control tooltip.
