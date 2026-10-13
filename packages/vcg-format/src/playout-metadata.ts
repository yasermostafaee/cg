import {
  activeRangeOf,
  hasEffectiveHoldDrivers,
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
  /** The hold WITHIN a pass. ⚠ Not the gap between passes — see {@link PlayoutMetadata.delayMs}. */
  holdMs?: number;
  repeat?: number | 'infinite';
  /**
   * `TIMING-BUILD-21` — the gap BETWEEN passes in milliseconds, so a scheduler computing a
   * looped composition's total length includes the dead air the author asked for. Omitting it
   * would make an N-pass template read as shorter than it is by `(N − 1) × delayMs`.
   */
  delayMs?: number;
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
  // B-032 — a content-driven hold with NO effective content drivers is a zero-length hold; resolve
  // it to timed (matching the runtime's `effectivePlayoutFor`) so the baked metadata agrees with
  // on-air and the authored `holdMs` is honored instead of being silently dropped.
  const holdSource =
    playout.holdSource === 'content-driven' && !hasEffectiveHoldDrivers(scene, scene.compositions)
      ? 'timed'
      : playout.holdSource;
  const meta: PlayoutMetadata = { mode: playout.mode };
  if (holdSource === 'content-driven') meta.holdSource = 'content-driven';
  if (playout.holdMs !== undefined) meta.holdMs = playout.holdMs;
  if (playout.repeat !== undefined) meta.repeat = playout.repeat;
  if (playout.delayMs !== undefined) meta.delayMs = playout.delayMs;
  if (scene.lifecycle !== undefined) {
    const active = activeRangeOf(scene);
    meta.outPoint = scene.lifecycle.outPoint;
    meta.outroDurationMs = Math.round(
      ((active.out - scene.lifecycle.outPoint) / scene.frameRate) * 1000,
    );
  }
  return meta;
}
