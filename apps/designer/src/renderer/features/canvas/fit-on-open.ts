/**
 * B-035 — the fit-on-open "fit exactly once per scene" state machine, extracted as a
 * pure function so the warm/cold handoff is unit-testable without a DOM.
 *
 * Fit-on-open must fire ONCE per scene and only when BOTH prerequisites are ready:
 * the scene (a non-null `sceneId`) AND the canvas viewport (real dimensions, which the
 * caller's `doFit` reflects by returning whether it actually fit). The gate records the
 * last scene that was ACTUALLY fit; a no-op fit (zero viewport, cold open) does NOT
 * consume the one fit, so a later retry — once the viewport is measured — succeeds.
 */
export interface FitGate {
  /** The last `sceneId` that was actually fit, or `null` if none yet. */
  fittedSceneId: string | null;
}

/**
 * Attempt the one fit for `sceneId`. No-ops if there's no scene or this scene was
 * already fit. Otherwise calls `doFit` (which performs the fit and returns whether it
 * actually applied a zoom) and records the scene as fitted ONLY on success. Returns
 * whether a fit was performed this call.
 */
export function fitOnceForScene(
  gate: FitGate,
  sceneId: string | null,
  doFit: () => boolean,
): boolean {
  if (sceneId === null) return false;
  if (gate.fittedSceneId === sceneId) return false; // already fit this scene → no double-fit
  if (doFit()) {
    gate.fittedSceneId = sceneId;
    return true;
  }
  return false; // viewport not ready yet — leave unmarked so a later retry can fit
}
