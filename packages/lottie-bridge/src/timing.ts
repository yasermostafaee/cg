/**
 * D-125 Phase 3a — the ONE place a Lottie's phase frames are converted between the
 * three frame spaces that matter: the ANIMATION's own frames, seconds of wall-clock
 * at the authored speed, and a COMPOSITION's frames.
 *
 * Deliberately shared by both consumers, because they must never disagree:
 *
 *   - `@cg/template-runtime` derives the composition's ENTRANCE SETTLE from
 *     {@link LottieTiming.settleOffset}, so native content (ticker / clock / sequence)
 *     starts when the Lottie furniture has visually settled — with no manual trim.
 *   - the Designer's Lottie Inspector RENDERS the same breakdown as authoring
 *     guidance, including the out-point warning.
 *
 * The number shown to the operator IS the number the runtime uses — computed once,
 * here, never twice.
 *
 * NOTE — this converts, it never RESCALES. The animation always plays at its authored
 * `fr × speed`; only the DERIVED settle moves. (design.md §D1.1 rejected the reverse —
 * slaving the Lottie so its intro-end lands on a fixed composition frame — because that
 * would require resampling the animation's frames, violating its opacity.)
 */

/** Bodymovin frame metadata: in-point, out-point, native frame rate. */
export interface LottieClipMeta {
  ip: number;
  op: number;
  fr: number;
}

/**
 * Defensive read of `ip` / `op` / `fr` off a PARSED bodymovin object. `fr` defaults to
 * 30 (the common bodymovin rate) and the span to `[0, 0]` (a degenerate clip) when the
 * JSON is malformed, so a bad asset never throws at wiring time.
 */
export function lottieClipMeta(data: unknown): LottieClipMeta {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return { ip: num(d['ip'], 0), op: num(d['op'], 0), fr: num(d['fr'], 30) };
}

/** One phase measured in all three spaces. */
export interface LottiePhaseSpan {
  /** Start frame, in the ANIMATION's frame space. */
  from: number;
  /** End frame, in the ANIMATION's frame space. */
  to: number;
  /** `to - from`, in ANIMATION frames (never negative). */
  frames: number;
  /** Wall-clock duration at the authored `fr × speed`. */
  seconds: number;
  /** The same duration expressed in THIS composition's frames (rounded). */
  compFrames: number;
}

export interface LottieTiming {
  meta: LottieClipMeta;
  /** The speed actually used (a non-positive / non-finite input falls back to 1). */
  speed: number;
  compositionFps: number;
  /** Whether the element carries an AUTHORED `phases` block (markers or manual). */
  hasPhases: boolean;
  /** The whole clip `[ip, op]`. */
  clip: LottiePhaseSpan;
  intro: LottiePhaseSpan;
  hold: LottiePhaseSpan;
  outro: LottiePhaseSpan;
  /**
   * How many COMPOSITION frames after the composition's `active.in` this Lottie's intro
   * has finished playing — i.e. the offset this element contributes to the scope's
   * entrance settle. `null` when it must NOT contribute.
   *
   * A MARKER-LESS clip contributes `null` on purpose. Without `phases` the driver falls
   * back to `introEnd = op` — "the whole clip is the intro" — but that is the ABSENCE of
   * information, not an authored claim that the entrance runs the full clip. Deriving a
   * settle from it would push a long unmarked clip's settle far past the out-point on
   * every scene that has one, clamping and warning for something the designer never
   * asserted. Phase 1 already refuses to trust that same `op` fallback for the canvas
   * poster frame (it uses the clip midpoint instead), so this keeps the two consistent
   * and keeps the change strictly additive for pre-D-125 scenes.
   */
  settleOffset: number | null;
}

export interface LottieTimingInput {
  /** The PARSED bodymovin animation (or anything — it is read defensively). */
  data: unknown;
  /** The element's playback speed multiplier. */
  speed: number;
  /** The element's authored phase mapping, in ANIMATION frames. Absent ⇒ marker-less. */
  phases?: { introEnd: number; outroStart: number } | undefined;
  /** The composition's frame rate (project-level `Scene.frameRate`). */
  compositionFps: number;
}

/** Compute the full intro / hold / outro breakdown for one Lottie in one composition. */
export function lottieTiming(input: LottieTimingInput): LottieTiming {
  const meta = lottieClipMeta(input.data);
  const speed = Number.isFinite(input.speed) && input.speed > 0 ? input.speed : 1;
  const compositionFps =
    Number.isFinite(input.compositionFps) && input.compositionFps > 0 ? input.compositionFps : 0;
  // Frames of ANIMATION consumed per second of wall-clock. Zero for a malformed clip,
  // which makes every span instantaneous rather than NaN/Infinity.
  const rate = meta.fr * speed;
  const clampFrame = (f: number): number => Math.min(Math.max(f, meta.ip), meta.op);

  const span = (from: number, to: number): LottiePhaseSpan => {
    const frames = Math.max(0, to - from);
    const seconds = rate > 0 ? frames / rate : 0;
    return { from, to, frames, seconds, compFrames: Math.round(seconds * compositionFps) };
  };

  const hasPhases = input.phases !== undefined;
  // Absent `phases` mirrors the driver's own fallback: the whole clip is the intro,
  // held (frozen) at `op`, with a degenerate outro. Malformed markers are clamped into
  // `[ip, op]` and kept monotonic so a hand-typed value can never invert a span.
  const introEnd = hasPhases ? clampFrame(input.phases?.introEnd ?? meta.op) : meta.op;
  const outroStart = hasPhases
    ? Math.max(introEnd, clampFrame(input.phases?.outroStart ?? meta.op))
    : meta.op;

  const intro = span(meta.ip, introEnd);
  return {
    meta,
    speed,
    compositionFps,
    hasPhases,
    clip: span(meta.ip, meta.op),
    intro,
    hold: span(introEnd, outroStart),
    outro: span(outroStart, meta.op),
    settleOffset: hasPhases ? intro.compFrames : null,
  };
}
