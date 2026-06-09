## Context

D-020 built a single `PlayoutController` and applied every animated element — even
ones inside nested instances — along the parent timeline. D-025 already builds a
**field-scope tree**: one `FieldScope` per composition instance (own
`elementMap`/`textOriginals`/container + nested `children` by namespace). The
cascade reuses that tree rather than introducing a parallel one.

## Decisions

### Reuse the D-025 scope tree, one controller per scope

`FieldScope` gains two lifecycle fields:

- `animated: NestedAnimatedEntry[]` — the animated elements rendered **directly** in
  this scope (collected at all depths during `buildLayer`, replacing the old
  depth-gated `BuildSceneResult.nestedAnimated` flat list).
- `source: LifecycleSource` — the comp/scene this scope renders
  (`frameRange`/`activeRange`/`lifecycle`/`playout`), so the controller resolves its
  own window + out-point + timing. The root scope's source is the `Scene`; each
  nested instance's source is its `Composition`.

`runtime.ts` walks the scope tree and builds a parallel **controller tree** (one
`PlayoutController` per scope). Each controller's `applyFrame` paints ONLY its own
scope's `animated`, so each scope animates on its own timeline.

### Root drives global state; children are local

The ROOT controller alone wires `onExitStart`/`onSettle` to the lifecycle state
machine + event bus + `cg-pending`, and uses the **effective** playout (stored
defaults merged with the non-persistent session `playoutOverride`). Nested
controllers use `playoutOf(scope.source)` (their own stored playout) and no-op
exit/settle callbacks — they must not emit global lifecycle events or apply the
override. `play/stop/pause/resume/remove` cascade parent-first over the tree.

### Child offset 0 (v1)

A nested child starts together with its parent. Real temporal offsets are a separate
future feature; element `lifespan` (visibility gating) is intentionally NOT
overloaded as an offset.

### Single project fps via schema strip

Removing `Composition.frameRate` means Zod strips any legacy per-composition value on
parse — automatic coercion to the single `Scene.frameRate` with no migration code and
no `schemaVersion` bump. Because `FrameDriver` derives frames from elapsed wall-time,
the one project fps is applied identically across every scope; each scope still keeps
its own frame range / active range / out-point, just not its own fps. There is no way
to "flag which comps changed" after the fact (the old value is gone on parse) — and
in practice every comp already matched the project fps.

### tick() vs the controllers

The injected-clock controllers drive on-air playback. `tick(frame)` (the designer
scrubber) paints a single shared frame across a flat union of every scope's
`animated`, independent of the controllers.
