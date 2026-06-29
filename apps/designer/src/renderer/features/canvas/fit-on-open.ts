/**
 * B-035 — fit-on-open helpers, kept pure so the "fit once per composition" gate and the
 * deterministic centering math are unit-testable without a DOM.
 *
 * Two bugs the first attempt exposed:
 *  - the gate was marked fitted on ZOOM success, before the deferred centering ran, so a
 *    bad center was never retried → frame stuck in a corner. The gate must be marked only
 *    AFTER centering applies (call {@link markFitted} from the centering layout-effect).
 *  - centering ran in a single fixed rAF reading transitional layout + stale scroll, which
 *    raced the warm switch. Centering is now derived ARITHMETICALLY ({@link frameCenterScroll})
 *    inside a layout-effect (settled, post-zoom-commit) — no race.
 */
export interface FitGate {
  /** The last fit-key (active composition) that was FULLY fit (zoom + center). */
  fittedKey: string | null;
}

/** Should we (re)attempt a fit for this key? True unless it's already been fully fit. */
export function needsFit(gate: FitGate, key: string | null): boolean {
  return key !== null && gate.fittedKey !== key;
}

/** Record that this key has been fully fit — call AFTER centering has actually applied. */
export function markFitted(gate: FitGate, key: string | null): void {
  if (key !== null) gate.fittedKey = key;
}

/**
 * The `scrollLeft` (or `scrollTop`) that centers the frame's CENTER on the viewport
 * center, derived purely from numbers — no `getBoundingClientRect`, no live `scrollLeft`,
 * so it cannot land in a corner on a not-yet-settled switch (B-035 Bug B):
 *
 *   `stageOffset` — the stage's left/top in the scroll container's content space (the
 *      container's padding when the stage overflows, which is the fit case);
 *   `frameOffsetScene` — the frame's inset within the pasteboard extent (scene px);
 *   `resolutionScene` — the frame's width/height (scene px);
 *   `zoom`, `viewportClient` — the current zoom and the scroll container's client size.
 *
 * Frame center in content = `stageOffset + (frameOffsetScene + resolutionScene/2) * zoom`;
 * subtract half the viewport to put that center at the viewport center. The browser clamps
 * the assigned scroll to the valid range, so an off-frame target just pins to an edge.
 */
export function frameCenterScroll(
  stageOffset: number,
  frameOffsetScene: number,
  resolutionScene: number,
  zoom: number,
  viewportClient: number,
): number {
  return stageOffset + (frameOffsetScene + resolutionScene / 2) * zoom - viewportClient / 2;
}
