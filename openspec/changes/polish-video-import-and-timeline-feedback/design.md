# Design — Video import and timeline feedback

## 1. Import keeps a short default path

Crop remains visible because it changes normal placement geometry. Premultiplied alpha and Alpha
bleed remain opt-in and default off, but live inside a closed disclosure. Their long purpose,
warning and performance copy moves behind the shared click-to-read Info action. Genuine conversion
warnings and failures remain visible.

## 2. A ruler scrub releases paused lifecycle ownership

Pause intentionally keeps the runtime lifecycle active so Play can resume it. A deliberate ruler
drag has different intent: it is an authoring seek. The ruler therefore clears the lifecycle
playback mode before changing `currentFrame`. The existing Canvas/iframe boundary sees a non-runtime
scrub, rebuilds the static authoring runtime once, and routes the frame through `runtime.tick()` and
Video `positionAt()`. Pause without a ruler drag remains resumable and on-air behaviour is unchanged.

## 3. A visible hold loop owns the reported root playhead

Root-frame observation follows the authored root cursor, including the content-driven hold-loop
driver. When Video/Lottie is the only moving picture and composition paint can remain collapsed,
the optional Designer observer receives a clock-only Middle loop without redundant `applyFrame`
calls. The observer remains root-only, so nested composition clocks cannot replace it. Content
drivers receive no reset, start or lifecycle transition at wrap.

This supersedes the D-182 sentence that treated hold-loop repaints as hidden internal work. A truly
parked timed/manual hold remains fixed; only an active non-degenerate Middle loop advances and wraps.
