import { describe, expect, it, vi } from 'vitest';
import { fitOnceForScene, type FitGate } from '../src/renderer/features/canvas/fit-on-open.js';

/**
 * B-035 — fit-on-open must fire exactly ONCE per scene, gated on the viewport being
 * measured. These lock the warm/cold handoff that the bug got wrong (cold open never
 * re-fit because the effect ran once against a zero viewport and gave up).
 */

describe('fitOnceForScene', () => {
  it('no scene → never attempts a fit', () => {
    const gate: FitGate = { fittedSceneId: null };
    const doFit = vi.fn(() => true);
    expect(fitOnceForScene(gate, null, doFit)).toBe(false);
    expect(doFit).not.toHaveBeenCalled();
    expect(gate.fittedSceneId).toBeNull();
  });

  it('WARM: viewport ready at the scene tick → fits once, then no-ops', () => {
    const gate: FitGate = { fittedSceneId: null };
    const doFit = vi.fn(() => true); // viewport measured → fit succeeds

    expect(fitOnceForScene(gate, 's1', doFit)).toBe(true); // fits
    expect(gate.fittedSceneId).toBe('s1');

    // A second trigger (e.g. the cold-fallback effect firing after paint) must NOT
    // fit again — no double-fit jump.
    expect(fitOnceForScene(gate, 's1', doFit)).toBe(false);
    expect(doFit).toHaveBeenCalledTimes(1);
  });

  it('COLD: viewport measured AFTER scene load → does not consume the fit, then fits once it lands', () => {
    const gate: FitGate = { fittedSceneId: null };
    // First two attempts run while the viewport is still zero-sized → fit no-ops.
    const coldFit = vi.fn(() => false);
    expect(fitOnceForScene(gate, 's1', coldFit)).toBe(false); // warm layout-effect, viewport 0
    expect(fitOnceForScene(gate, 's1', coldFit)).toBe(false); // cold effect, viewport still 0
    expect(gate.fittedSceneId).toBeNull(); // NOT marked — the one fit is still owed

    // The ResizeObserver reports a real viewport → the retry now succeeds.
    const warmFit = vi.fn(() => true);
    expect(fitOnceForScene(gate, 's1', warmFit)).toBe(true);
    expect(gate.fittedSceneId).toBe('s1');

    // And it does NOT fit a second time once the size keeps changing (manual zoom /
    // window resize after the one fit is left alone).
    const afterFit = vi.fn(() => true);
    expect(fitOnceForScene(gate, 's1', afterFit)).toBe(false);
    expect(afterFit).not.toHaveBeenCalled();
  });

  it('a new scene resets the gate → the next scene fits once', () => {
    const gate: FitGate = { fittedSceneId: 's1' };
    const doFit = vi.fn(() => true);
    expect(fitOnceForScene(gate, 's2', doFit)).toBe(true);
    expect(gate.fittedSceneId).toBe('s2');
    expect(fitOnceForScene(gate, 's2', doFit)).toBe(false); // once only
  });
});
