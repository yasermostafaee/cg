/**
 * media-phases-follow-composition — the ONE comp-side derivation for a media element whose
 * phase source is `'composition'`.
 *
 * D-176 — Follow is owned by the COMPOSITION. It decides the media window from only the
 * composition's entrance / OUT spans and the clip duration; media-internal markers, manual
 * phase values and legacy `holdAt` values are intentionally outside this API:
 *
 * - the first `entranceSpan` of the clip is the intro;
 * - the clip's last frames cover the composition Outro time remaining after an optional delay;
 * - the remainder between them is the middle, which the element may freeze or loop while the
 *   composition holds.
 *
 * It works in MILLISECONDS — video's native unit — so the video "adapter" is the identity and
 * the runtime / `VideoSections` consume it directly. The ONE real unit adapter is
 * `lottieFollowWindow` (`@cg/lottie-bridge`), which converts animation frames ↔ clip ms at the
 * edge and delegates every comp-side decision HERE. This project has been bitten repeatedly by
 * a second copy of one rule (see the change's design.md §1.1) — the comp-side arithmetic exists
 * once, in this file.
 *
 * `speed` never appears here: the window changes WHICH frames play, never the rate (§D1.1).
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
  /** Composition-relative delay for a Follow video, before its tail starts. */
  outroDelayFrames?: number | undefined;
}

/** The derived window, clip ms. Every clamp is FLAGGED for the existing hint machinery. */
export interface FollowWindow {
  /** `(contentStart − activeIn)` in ms — how long the entrance gives the intro. */
  entranceSpanMs: number;
  /** `(activeOut − outPoint)` in ms — how long the OUT segment gives the outro. */
  outSpanMs: number;
  /** The clip time where the composition's intro ends. */
  holdMs: number;
  /** Where the intro window begins (clip ms), normally the clip head. */
  introStartMs: number;
  /**
   * Compatibility field. Composition-owned Follow starts the intro at `active.in`, so this is 0.
   */
  introDelayMs: number;
  /** Offset from the composition's OUT point before the clip starts moving. */
  outroDelayMs: number;
  /** Where the outro begins in the clip, anchored to its end. */
  outroStartMs: number;
  /** Where the outro ends: the CLIP END, always — the ending is the clip's own. */
  outroEndMs: number;
  /** Whether the derived outro has any length to play. */
  hasOutro: boolean;
  /** Compatibility field; always false because media phases never govern Follow. */
  authored: boolean;
  clamps: {
    /** The clip is shorter than the composition entrance and freezes early. */
    introShort: boolean;
    /** The composition entrance extends past the clip end. */
    holdPastEnd: boolean;
    /**
     * Session V — the COMPOSITION's OUT segment has zero length (`outPoint` at — or, on a
     * pre-clamp-fix scene, past — `activeRange.out`), so a follower has NO outro and the held
     * look persists through the exit. Deliberate (zero room is zero outro) but never SILENT —
     * reachable by ordinary authoring; §9.1's rule: inert behaviour explains itself.
     */
    noOutSegment: boolean;
    /** `outSpan ≥ clip length` — the outro starts at the clip start; the whole clip is the outro. */
    wholeClipOutro: boolean;
    /**
     * Compatibility flag; always false because Follow does not use authored media outro marks.
     */
    outroCutByRemoval: boolean;
    /** Compatibility flag; always false because Follow does not use authored media intro marks. */
    lateSettle: boolean;
    /**
     * The hold→outro seam jumps (`outroStartMs !== holdMs`, either direction): fine for a
     * clip that is static in its middle — the case this feature targets — but the hint names
     * BOTH clip times so a non-static clip's pop is visible before air. Informational,
     * deliberately accepted.
     */
    holdJump: boolean;
  };
}

/** Derive the follow window. Pure; defensive against a zero/invalid `fps` (degenerate spans, never NaN). */
export function followWindowMs(anchors: FollowAnchors, clip: FollowClip): FollowWindow {
  const frameMs = Number.isFinite(anchors.fps) && anchors.fps > 0 ? 1000 / anchors.fps : 0;
  const entranceSpanMs = Math.max(0, (anchors.contentStart - anchors.activeIn) * frameMs);
  const outSpanMs = Math.max(0, (anchors.activeOut - anchors.outPoint) * frameMs);
  const durationMs = Math.max(0, clip.durationMs);
  const holdRaw = entranceSpanMs;
  const holdMs = Math.min(Math.max(0, holdRaw), durationMs);

  // THE INTRO — the clip head through the composition entrance span.
  const introStartMs = Math.max(0, holdMs - entranceSpanMs);
  const introDelayMs = 0;

  // THE OUTRO — the clip's own ending, end-anchored to the composition OUT span.
  const outroDelayMs = Math.min(
    Math.max(0, outSpanMs - frameMs),
    Math.max(0, clip.outroDelayFrames ?? 0) * frameMs,
  );
  const tailSpanMs = outSpanMs - outroDelayMs;
  const outroStartMs = Math.max(0, durationMs - tailSpanMs);
  const outroEndMs = durationMs;
  const hasOutro = tailSpanMs > 0 && outroStartMs < outroEndMs;

  return {
    entranceSpanMs,
    outSpanMs,
    holdMs,
    introStartMs,
    introDelayMs,
    outroDelayMs,
    outroStartMs,
    outroEndMs,
    hasOutro,
    authored: false,
    clamps: {
      introShort: holdMs < entranceSpanMs,
      holdPastEnd: holdRaw > durationMs,
      noOutSegment: outSpanMs <= 0,
      wholeClipOutro: durationMs > 0 && tailSpanMs >= durationMs,
      outroCutByRemoval: false,
      lateSettle: false,
      holdJump: hasOutro && outroStartMs !== holdMs,
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
