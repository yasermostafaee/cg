/**
 * media-phases-follow-composition — the ONE comp-side derivation for a media element whose
 * phase source is `'composition'`: a CONTINUOUS window through the clip, anchored at the HOLD
 * time `H`, so the clip reaches its hold look EXACTLY at the composition's effective content
 * start, holds it, and eases onward through the OUT segment — no hold→outro pop by construction.
 *
 * It works in MILLISECONDS — video's native unit — so the video "adapter" is the identity and
 * the runtime / `VideoSections` consume it directly. The ONE real unit adapter is
 * `lottieFollowWindow` (`@cg/lottie-bridge`, the module whose charter is already cross-space
 * conversion), which converts animation frames ↔ clip ms at the edge and delegates every
 * comp-side decision HERE. This project has been bitten four times by a second copy of one rule
 * (see the change's design.md §1.1) — the comp-side arithmetic exists once, in this file.
 *
 * The REJECTED alternative, recorded so it is not re-invented: anchoring the outro to the clip's
 * END (`[clipEnd − outSpan → clipEnd]`) would show an authored build-off tail, but the held frame
 * would CUT to a distant frame at the OUT boundary — the exact discontinuity follow exists to
 * remove. An operator who wants the clip's authored ending uses markers/manual phases.
 *
 * `speed` never appears here: the window changes WHICH frames play, never the rate (§D1.1). The
 * Lottie adapter folds `fr × speed` into its ms conversion; the comp-side math is rate-blind.
 */

/** The composition-side anchors, in COMP frames at `fps`. */
export interface FollowAnchors {
  /** The composition's `active.in`. */
  activeIn: number;
  /** The EFFECTIVE content start: `lifecycle.contentStart` when placed, else the entrance-settle heuristic. */
  contentStart: number;
  /** `lifecycle.outPoint` — where the OUT segment begins. */
  outPoint: number;
  /** The composition's `active.out` — where the OUT segment ends. */
  activeOut: number;
  /** The composition's frame rate. */
  fps: number;
}

/** The clip side, in the clip's own ms. */
export interface FollowClip {
  /** Clip length in ms (video `durationMs`; Lottie `(op − ip) / (fr × speed) × 1000`). */
  durationMs: number;
  /** Authored hold time `H` in clip ms; absent ⇒ `H` = entrance span ("play from the head"). */
  holdAtMs?: number | undefined;
}

/** The derived window, clip ms. Every clamp is FLAGGED for the existing hint machinery. */
export interface FollowWindow {
  /** `(contentStart − activeIn)` in ms — how long the entrance gives the intro. */
  entranceSpanMs: number;
  /** `(activeOut − outPoint)` in ms — how long the OUT segment gives the outro. */
  outSpanMs: number;
  /** `H`, clamped into `[0, durationMs]` — the held clip time. */
  holdMs: number;
  /** `max(0, H − entranceSpan)` — where the intro window begins. */
  introStartMs: number;
  /** `min(H + outSpan, durationMs)` — where the outro window ends. */
  outroEndMs: number;
  /** Whether the derived outro has any length (`outroEndMs > holdMs`). */
  hasOutro: boolean;
  clamps: {
    /** `H < entranceSpan`: the intro starts at the clip start, SHORTER than the entrance — the clip freezes early. */
    introShort: boolean;
    /** `H + outSpan > clipEnd`: the outro clamps at the clip end. */
    outroClamped: boolean;
    /** `H` (authored or defaulted) sat past the clip end — a stale `holdAt` after an asset swap, or a clip shorter than the entrance. */
    holdPastEnd: boolean;
  };
}

/** Derive the follow window. Pure; defensive against a zero/invalid `fps` (degenerate spans, never NaN). */
export function followWindowMs(anchors: FollowAnchors, clip: FollowClip): FollowWindow {
  const frameMs = Number.isFinite(anchors.fps) && anchors.fps > 0 ? 1000 / anchors.fps : 0;
  const entranceSpanMs = Math.max(0, (anchors.contentStart - anchors.activeIn) * frameMs);
  const outSpanMs = Math.max(0, (anchors.activeOut - anchors.outPoint) * frameMs);
  const durationMs = Math.max(0, clip.durationMs);
  // Default H = clip start + entrance span, which degenerates exactly to "play the clip from
  // its head" — the simple case is the general rule at H = entranceSpan, not a separate branch.
  const holdRaw = clip.holdAtMs ?? entranceSpanMs;
  const holdMs = Math.min(Math.max(0, holdRaw), durationMs);
  const introStartMs = Math.max(0, holdMs - entranceSpanMs);
  const outroEndMs = Math.min(holdMs + outSpanMs, durationMs);
  return {
    entranceSpanMs,
    outSpanMs,
    holdMs,
    introStartMs,
    outroEndMs,
    hasOutro: outroEndMs > holdMs,
    clamps: {
      introShort: holdMs < entranceSpanMs,
      outroClamped: holdMs + outSpanMs > durationMs,
      holdPastEnd: holdRaw > durationMs,
    },
  };
}

/**
 * The ONE spelling of "is this element a follower" (golden rule 6: a predicate's name is its
 * contract, and it exists once). Structurally accepts BOTH kinds' phases — the Lottie's
 * `source: 'markers' | 'manual' | 'composition'` and the video's optional
 * `source?: 'manual' | 'composition'` (absent ⇒ manual-equivalent ⇒ not a follower).
 */
export function followsComposition(phases: { source?: string | undefined } | undefined): boolean {
  return phases?.source === 'composition';
}
