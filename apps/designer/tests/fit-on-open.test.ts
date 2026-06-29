import { describe, expect, it } from 'vitest';
import {
  needsFit,
  markFitted,
  frameCenterScroll,
  type FitGate,
} from '../src/renderer/features/canvas/fit-on-open.js';

/**
 * B-035 — fit-on-open. Two invariants the first attempt got wrong:
 *  - the gate is "fit once per composition" and must be marked ONLY after centering
 *    applied (markFitted), so a zoom-succeeded-but-center-pending attempt can retry;
 *  - centering is derived from numbers (frameCenterScroll) so it cannot land in a corner.
 * The prior test only locked zoom-once and missed the centering failure — this adds it.
 */

describe('fit-once gate (needsFit / markFitted)', () => {
  it('no key → never needs a fit', () => {
    expect(needsFit({ fittedKey: null }, null)).toBe(false);
  });

  it('needs a fit until the key is marked fitted (only after centering applies)', () => {
    const gate: FitGate = { fittedKey: null };
    expect(needsFit(gate, 'compA')).toBe(true);
    // A zoom that succeeded but whose centering has NOT run yet must NOT mark the gate —
    // so it still needs a fit and the cold/center retry can finish it.
    expect(needsFit(gate, 'compA')).toBe(true);
    // Centering applied → mark.
    markFitted(gate, 'compA');
    expect(needsFit(gate, 'compA')).toBe(false); // no double-fit
  });

  it('a different composition resets the gate → it fits once', () => {
    const gate: FitGate = { fittedKey: 'compA' };
    expect(needsFit(gate, 'compB')).toBe(true); // switch → re-fit
    markFitted(gate, 'compB');
    expect(needsFit(gate, 'compB')).toBe(false);
    expect(needsFit(gate, 'compA')).toBe(true); // back to A → fits again
  });
});

describe('frameCenterScroll — centering math (the missed assertion)', () => {
  // Centering means: after applying the returned scroll, the FRAME CENTER lands at the
  // VIEWPORT CENTER. (stageOffset + (frameOffset + res/2)*zoom) − scroll === viewport/2.
  function frameCenterOnScreen(
    stageOffset: number,
    frameOffset: number,
    res: number,
    zoom: number,
    viewport: number,
  ): number {
    const scroll = frameCenterScroll(stageOffset, frameOffset, res, zoom, viewport);
    return stageOffset + (frameOffset + res / 2) * zoom - scroll;
  }

  it('centers the frame in the viewport (1920 frame, 2× pasteboard, fit zoom)', () => {
    // 1920×1080 frame, symmetric 2× pasteboard → frame inset 960px; fit in a 1280-wide
    // viewport ⇒ zoom 0.5 (frame 960px on screen). Pad 8px.
    const scroll = frameCenterScroll(8, 960, 1920, 0.5, 1280);
    // frame center content = 8 + (960 + 960)*0.5 = 968 → scroll = 968 − 640 = 328.
    expect(scroll).toBe(328);
    // And it actually centers: frame center appears at the viewport center.
    expect(frameCenterOnScreen(8, 960, 1920, 0.5, 1280)).toBe(640);
  });

  it('NEVER lands the frame in a corner (center, not 0) for a typical fit', () => {
    const scroll = frameCenterScroll(8, 540, 1080, 0.5, 720); // vertical axis
    expect(scroll).toBeGreaterThan(0); // not pinned to the top-left corner
    expect(frameCenterOnScreen(8, 540, 1080, 0.5, 720)).toBe(360); // = viewport/2
  });

  it('is independent of any prior scroll (pure function of the numbers)', () => {
    // Same inputs → same target regardless of where the previous scene was scrolled.
    const a = frameCenterScroll(8, 960, 1920, 0.5, 1280);
    const b = frameCenterScroll(8, 960, 1920, 0.5, 1280);
    expect(a).toBe(b);
  });
});
