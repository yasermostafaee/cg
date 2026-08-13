/**
 * media-phases-follow-composition — the ONE comp-side derivation for a media element whose
 * phase source is `'composition'`.
 *
 * ⭐ SESSION Y (2026-08-13) — THE CORRECTED RULE: **a follower's outro is the CLIP'S OWN
 * ENDING.** Follow decides WHEN phases happen, never WHICH frames the clip's ending consists
 * of:
 *
 * - clip with NO authored phases: intro `[max(0, H − entranceSpan) → H]` (unchanged), freeze at
 *   `H`, outro **`[clipEnd − outSpan → clipEnd]`** — landing on the clip's last frame exactly
 *   as the composition removes the element;
 * - clip WITH authored phases (`introEnd`/`outroStart` from markers or manual): **they WIN.**
 *   Intro = the clip's `[0 → introEnd]`, scheduled (via `introDelayMs`) so it FINISHES at the
 *   composition's effective content start; hold = freeze at `introEnd`; outro = the clip's own
 *   `[outroStart → clipEnd]`, started when the OUT phase begins. Authored content always beats
 *   derived — that precedence is stated once, here.
 * - `holdAt` keeps its meaning in the no-phases case only; with authored phases the hold frame
 *   IS `introEnd` (the Inspector says so instead of showing a dead input).
 *
 * DELIBERATELY ACCEPTED: with no authored phases the hold→outro seam MAY jump if the clip is
 * not static in its middle (`clamps.holdJump` names both clip times for the hint). That is
 * strictly better than never showing the ending.
 *
 * THE SUPERSEDED RULE, kept as the record of what was wrong (it shipped, and the owner
 * reported its consequence three times): the outro used to be `[H → min(H + outSpan,
 * clipEnd)]` — anchored at the HOLD — and end-anchoring was explicitly rejected because "the
 * held frame would CUT to a distant frame at the OUT boundary — the exact discontinuity follow
 * exists to remove". That premise fails for the clips this feature targets: a furniture
 * backdrop is built to be STATIC between its build-on and its build-off, so the held frame and
 * the end-anchored outro's first frame both sit inside that static region and cannot visibly
 * pop. The old rule optimised against an unreachable hazard and, in exchange, could never show
 * a clip's ending — the "outro" it played was the motionless middle, and the authored build-off
 * never played at all.
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
  /** Authored hold time `H` in clip ms; absent ⇒ `H` = entrance span. NO-PHASES case only. */
  holdAtMs?: number | undefined;
  /**
   * The clip's AUTHORED intro end (ms), when the operator/markers genuinely set one — pass it
   * only through {@link videoFollowClipFacts} (or the Lottie adapter's equivalent), which
   * treats the attach SEED SIGNATURE as not-authored. Present ⇒ the authored intro governs.
   */
  authoredIntroEndMs?: number | undefined;
  /** The clip's AUTHORED outro start (ms), same discipline. Present ⇒ the authored outro governs. */
  authoredOutroStartMs?: number | undefined;
}

/** The derived window, clip ms. Every clamp is FLAGGED for the existing hint machinery. */
export interface FollowWindow {
  /** `(contentStart − activeIn)` in ms — how long the entrance gives the intro. */
  entranceSpanMs: number;
  /** `(activeOut − outPoint)` in ms — how long the OUT segment gives the outro. */
  outSpanMs: number;
  /** The clip time the hold sits on: `H` (no-phases) or the authored `introEnd`. */
  holdMs: number;
  /** Where the intro window begins (clip ms): `max(0, H − entranceSpan)`, or `0` when authored. */
  introStartMs: number;
  /**
   * Comp-side WAIT (ms after `active.in`) before the intro starts. Non-zero only for an
   * AUTHORED intro shorter than the entrance — the clip parks on its first frame, then plays
   * `[0 → introEnd]` so it FINISHES exactly at the content start.
   */
  introDelayMs: number;
  /** Where the outro begins (clip ms): `max(0, clipEnd − outSpan)`, or the authored `outroStart`. */
  outroStartMs: number;
  /** Where the outro ends: the CLIP END, always — the ending is the clip's own. */
  outroEndMs: number;
  /** Whether the derived outro has any length to play. */
  hasOutro: boolean;
  /** Whether authored clip phases governed the window (the precedence rule, surfaced). */
  authored: boolean;
  clamps: {
    /** No-phases: `H < entranceSpan` — the intro starts at the clip start, shorter than the entrance; freezes early. */
    introShort: boolean;
    /** No-phases: `H` (authored or defaulted) sat past the clip end — stale `holdAt`, or a clip shorter than the entrance. */
    holdPastEnd: boolean;
    /**
     * Session V — the COMPOSITION's OUT segment has zero length (`outPoint` at — or, on a
     * pre-clamp-fix scene, past — `activeRange.out`), so a follower has NO outro and the held
     * look persists through the exit. Deliberate (zero room is zero outro) but never SILENT —
     * reachable by ordinary authoring; §9.1's rule: inert behaviour explains itself.
     */
    noOutSegment: boolean;
    /** No-phases: `outSpan ≥ clip length` — the outro starts at the clip start; the WHOLE clip is the outro. */
    wholeClipOutro: boolean;
    /**
     * Authored outro longer than the OUT segment: the timeline removes the element mid-outro
     * (on air the exit WAITS for the element outro — content-first ordering — so the exit runs
     * longer than the OUT segment instead). Flagged, never rescaled or re-windowed.
     */
    outroCutByRemoval: boolean;
    /** Authored intro longer than the entrance: it starts at `active.in` and settles LATE. */
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
  const authoredIntro = clip.authoredIntroEndMs !== undefined;
  const authoredOutro = clip.authoredOutroStartMs !== undefined;

  // THE HOLD — authored introEnd wins; else H = holdAt ?? entranceSpan ("play from the head").
  const holdRaw = authoredIntro
    ? (clip.authoredIntroEndMs as number)
    : (clip.holdAtMs ?? entranceSpanMs);
  const holdMs = Math.min(Math.max(0, holdRaw), durationMs);

  // THE INTRO — authored: the clip's own [0 → introEnd], DELAYED to finish at the content
  // start (or started at active.in and settling late when it cannot fit). No-phases:
  // [max(0, H − entranceSpan) → H] from the composition's IN, unchanged from the shipped rule.
  const introStartMs = authoredIntro ? 0 : Math.max(0, holdMs - entranceSpanMs);
  const introDurationMs = holdMs - introStartMs;
  const introDelayMs = authoredIntro ? Math.max(0, entranceSpanMs - introDurationMs) : 0;

  // THE OUTRO — the clip's own ending: authored [outroStart → clipEnd], else END-anchored
  // [clipEnd − outSpan → clipEnd].
  const outroStartMs = authoredOutro
    ? Math.min(Math.max(0, clip.authoredOutroStartMs as number), durationMs)
    : Math.max(0, durationMs - outSpanMs);
  const outroEndMs = durationMs;
  const hasOutro = outSpanMs > 0 && outroStartMs < outroEndMs;

  return {
    entranceSpanMs,
    outSpanMs,
    holdMs,
    introStartMs,
    introDelayMs,
    outroStartMs,
    outroEndMs,
    hasOutro,
    authored: authoredIntro || authoredOutro,
    clamps: {
      introShort: !authoredIntro && holdMs < entranceSpanMs,
      holdPastEnd: !authoredIntro && holdRaw > durationMs,
      noOutSegment: outSpanMs <= 0,
      wholeClipOutro: !authoredOutro && durationMs > 0 && outSpanMs >= durationMs,
      outroCutByRemoval: authoredOutro && outSpanMs > 0 && durationMs - outroStartMs > outSpanMs,
      lateSettle: authoredIntro && introDurationMs > entranceSpanMs,
      holdJump: hasOutro && outroStartMs !== holdMs,
    },
  };
}

/**
 * Session Y — the ONE discrimination between AUTHORED video phases and the attach SEED
 * SIGNATURE. Attach used to write `{introEnd: round(durationMs / 2), outroStart: durationMs}`
 * into a clip that had no phases — values the old rule then ignored. Under the corrected rule
 * authored values GOVERN, so those stored seeds must not masquerade as intent: a field equal to
 * its seed value derives as if absent. (A hand-authored value that happens to equal the seed is
 * treated as derived — a corner accepted and recorded in the change's design.md; the derived
 * behaviour is closest to such a clip's intent anyway.) Going forward, attach writes
 * `{source: 'composition'}` alone; this shim is what keeps every already-saved follow scene —
 * the owner's included — deriving correctly.
 */
export function videoFollowClipFacts(
  phases: { introEnd?: number | undefined; outroStart?: number | undefined } | undefined,
  durationMs: number,
): { authoredIntroEndMs?: number; authoredOutroStartMs?: number } {
  if (phases === undefined) return {};
  const out: { authoredIntroEndMs?: number; authoredOutroStartMs?: number } = {};
  if (phases.introEnd !== undefined && phases.introEnd !== Math.round(durationMs / 2)) {
    out.authoredIntroEndMs = phases.introEnd;
  }
  if (phases.outroStart !== undefined && phases.outroStart !== durationMs) {
    out.authoredOutroStartMs = phases.outroStart;
  }
  return out;
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
