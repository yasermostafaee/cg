import { activeRangeOf, playoutOf, type PlayoutMode, type Scene } from '@cg/shared-schema';

/**
 * D-020 — the lifecycle + playout timing a control layer needs to schedule a
 * composition (precise timed auto-out, looped logos, …) without re-deriving it
 * from the scene. The single-file exporter embeds this alongside the GDD; the
 * runtime itself reads `scene.lifecycle` / `scene.playout` directly (the whole
 * scene is inlined), so this block is purely for the scheduler.
 */
export interface PlayoutMetadata {
  mode: PlayoutMode;
  introEndFrame?: number;
  outroStartFrame?: number;
  holdMs?: number;
  repeat?: number | 'infinite';
  /**
   * The outro's duration in milliseconds —
   * `(activeRange.out − outroStartFrame) / frameRate × 1000`. Present only when
   * the composition has lifecycle markers. Lets the control layer pause before
   * the outro and stop exactly when it ends.
   */
  outroDurationMs?: number;
}

/** Build the {@link PlayoutMetadata} for a scene (mode always present). */
export function buildPlayoutMetadata(scene: Scene): PlayoutMetadata {
  const playout = playoutOf(scene);
  const meta: PlayoutMetadata = { mode: playout.mode };
  if (playout.holdMs !== undefined) meta.holdMs = playout.holdMs;
  if (playout.repeat !== undefined) meta.repeat = playout.repeat;
  if (scene.lifecycle !== undefined) {
    const active = activeRangeOf(scene);
    meta.introEndFrame = scene.lifecycle.introEndFrame;
    meta.outroStartFrame = scene.lifecycle.outroStartFrame;
    meta.outroDurationMs = Math.round(
      ((active.out - scene.lifecycle.outroStartFrame) / scene.frameRate) * 1000,
    );
  }
  return meta;
}
