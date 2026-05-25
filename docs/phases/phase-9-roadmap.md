# Phase 9 — Keyframe Animation Pivot

Replaces the v1 preset-based animation system (Phase 3 §5, shipped in M7–M8) with a Loopic-style per-property keyframe model. v1 is feature-complete and tagged at `v1.0.0`; this is the v2 animation architecture.

## Why the pivot

The preset model (entry / loop / exit kinds like `fade`, `slide`, `ticker`, `pulse`) was a fast path to broadcast-correct animations without a timeline editor. Operators wanted finer control — "rectangle starts at position X1 in red, at frame 17 it's at X2, wider, and yellow." That's a keyframe model, not a preset model. The two describe animation in fundamentally incompatible ways, so this is a replacement, not an extension.

## What changes

| Surface            | v1 (presets)                                                  | v2 (keyframes)                                                        |
| ------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Schema             | `ElementAnimation { entry, loop, exit }` discriminated unions | `ElementAnimation { tracks: { 'position.x': Track, … } }`             |
| Runtime            | M3.2-α stub + M8.1 ticker loop                                | Frame-driven interpolator over per-property tracks                    |
| Designer Inspector | AnimationSection with entry/loop/exit kind selectors          | Per-field "record keyframe" diamonds at current frame                 |
| Designer timeline  | TimelineStrip showing entry/loop/exit blocks                  | Loopic-style per-property tracks with draggable diamonds              |
| Preflight          | 100-combination preset coverage (M7.4)                        | Keyframe-shape coverage (orphan frames, past-duration, non-monotonic) |
| Starters           | Hand-authored preset choices                                  | Re-authored as keyframe tracks                                        |

## Sub-milestones

- **M12.0** — Keyframe schema in `@cg/shared-schema`. Drop preset types; add `Keyframe { frame, value, easing }`, `Track`, `ElementAnimation { tracks }`, `Scene.frameRange { in, out }`.
- **M12.1** — Frame-driven runtime in `@cg/template-runtime`. `runtime.play()` starts a rAF loop, advances `currentFrame`, interpolates each track, applies to DOM. Linear easing first.
- **M12.2** — Timeline dock UI. Frame scrubber, play/pause/step, per-property tracks, draggable diamonds.
- **M12.3** — Inspector "record keyframe" diamonds next to every keyframeable field.
- **M12.4** — Migrate the 6 v1 starters to keyframe tracks. Ticker becomes `position.x` keyframes with linear easing (same visual, declarative).
- **M12.5** — Tear down preset-era tests; update preflight; remove `ticker.ts`, `animation-defaults.ts`.

## Exit criteria

- Every starter template plays correctly under the new runtime.
- A user can: select an element, scrub to frame N, change a value (position / size / color / opacity), see a keyframe diamond appear, scrub back to frame 0, see the original value.
- All preset-era types (`EntryPreset`, `LoopPreset`, `ExitPreset`) are removed from the schema; `git grep EntryPreset` returns zero results outside the v1 archive folder.

## Deliberately out of Phase 9

- **Cubic-bezier easing curves** between keyframes — linear only in M12.1; cubic lands in M12.6 if needed.
- **Multi-element selection / multi-track editing** — single-element keyframe editing only.
- **Keyframe interpolation modes other than tween** — no "hold" or "step" interpolation in v2.0; can land as a per-keyframe flag later.
- **Audio sync** — frame-driven, not time-of-day driven; broadcast frame rate is enough.

## Migration notes

There is no in-place migration. v1 `.vcg` files continue to play on v1 runtimes; v2 runtimes will reject v1 animation payloads at schema parse. Operators with v1 templates re-author them in the v2 Designer once.
