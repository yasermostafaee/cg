import {
  activeRangeOf,
  playoutOf,
  type HoldSource,
  type PlayoutMode,
  type Scene,
} from '@cg/shared-schema';

/**
 * D-020 — the lifecycle + playout timing a control layer needs to schedule a
 * composition (precise timed auto-out, looped logos, …) without re-deriving it
 * from the scene. The single-file exporter embeds this alongside the GDD; the
 * runtime itself reads `scene.lifecycle` / `scene.playout` directly (the whole
 * scene is inlined), so this block is purely for the scheduler.
 */
export interface PlayoutMetadata {
  mode: PlayoutMode;
  /**
   * D-028 — present ONLY when 'content-driven' (absent = timed, the universal
   * default): the hold ends when the scope's tickers complete, so a scheduler
   * cannot precompute its length — the scene's content decides at runtime.
   */
  holdSource?: HoldSource;
  outPoint?: number;
  holdMs?: number;
  repeat?: number | 'infinite';
  /**
   * The outro's duration in milliseconds —
   * `(activeRange.out − outPoint) / frameRate × 1000`. Present only when the
   * composition has an `outPoint`. Lets the control layer pause before the outro
   * and stop exactly when it ends.
   */
  outroDurationMs?: number;
}

/** Build the {@link PlayoutMetadata} for a scene (mode always present). */
export function buildPlayoutMetadata(scene: Scene): PlayoutMetadata {
  const playout = playoutOf(scene);
  const meta: PlayoutMetadata = { mode: playout.mode };
  if (playout.holdSource === 'content-driven') meta.holdSource = 'content-driven';
  if (playout.holdMs !== undefined) meta.holdMs = playout.holdMs;
  if (playout.repeat !== undefined) meta.repeat = playout.repeat;
  if (scene.lifecycle !== undefined) {
    const active = activeRangeOf(scene);
    meta.outPoint = scene.lifecycle.outPoint;
    meta.outroDurationMs = Math.round(
      ((active.out - scene.lifecycle.outPoint) / scene.frameRate) * 1000,
    );
  }
  return meta;
}
