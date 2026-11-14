import { describe, expect, it } from 'vitest';
import {
  CG_CONTROL_KEY,
  FrameTransitionSchema,
  frameTransitionPhases,
  frameTransitionProgress,
  readCgControl,
  withCgControl,
  type FrameTransitionPhase,
} from '../src/index.js';

describe('live frame transitions', () => {
  it('cuts by default and switches geometry at zero opacity for Fade alone', () => {
    expect(frameTransitionPhases({ motion: 'cut', fade: false, durationMs: 400 }, 10)).toEqual([]);
    expect(frameTransitionPhases({ motion: 'cut', fade: true, durationMs: 400 }, 10)).toEqual([
      { frames: 5, easing: 'linear', progress: 0, opacity: 0 },
      { frames: 0, easing: 'linear', progress: 1, opacity: 0 },
      { frames: 5, easing: 'linear', progress: 1, opacity: 1 },
    ]);
  });

  it('matches the single native Ease in/out curve when adding a Fade', () => {
    const [out, back] = frameTransitionPhases(
      { motion: 'ease-in-out', fade: true, durationMs: 400 },
      10,
    );
    expect(out).toEqual({ frames: 5, easing: 'easeinquad', progress: 0.5, opacity: 0 });
    expect(back).toEqual({ frames: 5, easing: 'easeoutquad', progress: 1, opacity: 1 });
    expect(frameTransitionProgress('easeinquad', 0.5) / 2).toBe(
      frameTransitionProgress('easeinoutquad', 0.25),
    );
    expect((1 + frameTransitionProgress('easeoutquad', 0.5)) / 2).toBe(
      frameTransitionProgress('easeinoutquad', 0.75),
    );
  });

  it('round-trips a phase and rejects invalid effect properties independently of other updates', () => {
    const from = { x: 0, y: 0, width: 200, height: 100 };
    const frameTransition: FrameTransitionPhase = {
      durationMs: 200,
      easing: 'easeinquad',
      frames: [
        {
          frameKey: 'plate',
          lookId: 'two',
          from,
          to: { ...from, x: 100 },
          fromOpacity: 1,
          toOpacity: 0,
        },
      ],
      hideFallbackPlateIds: ['plate'],
    };
    expect(readCgControl(withCgControl({}, { frameTransition }))).toEqual({ frameTransition });
    expect(readCgControl(withCgControl({}, { frameTransition: null }))).toEqual({
      frameTransition: null,
    });
    expect(
      readCgControl({
        [CG_CONTROL_KEY]: { look: 'two', frameTransition: { ...frameTransition, durationMs: -1 } },
      }),
    ).toEqual({ look: 'two' });
    expect(
      FrameTransitionSchema.safeParse({ motion: 'cut', fade: true, durationMs: 0 }).success,
    ).toBe(false);
  });
});
