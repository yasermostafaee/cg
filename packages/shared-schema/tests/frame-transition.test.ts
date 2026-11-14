import { describe, expect, it } from 'vitest';
import {
  CG_CONTROL_KEY,
  FrameTransitionPhaseSchema,
  FrameTransitionSchema,
  frameTransitionPhases,
  frameTransitionProgress,
  presetTransitionDurations,
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

  it.each(['bounce', 'elastic'] as const)(
    '%s rebounds inside the clip bounds and settles within the selected duration',
    (motion) => {
      for (const frameCount of [2, 3, 5, 10, 23]) {
        const phases = frameTransitionPhases({ motion, fade: true, durationMs: 400 }, frameCount);
        expect(phases.reduce((sum, phase) => sum + phase.frames, 0)).toBe(frameCount);
        expect(phases[0]?.opacity).toBe(0);
        expect(phases.at(-1)).toMatchObject({ progress: 1, opacity: 1 });
        for (const step of phases) {
          expect(step.frames).toBeGreaterThan(0);
          expect(step.progress).toBeGreaterThanOrEqual(0);
          expect(step.progress).toBeLessThanOrEqual(1);
        }
      }
      const long = frameTransitionPhases({ motion, fade: false, durationMs: 400 }, 20);
      expect(long.length).toBe(motion === 'bounce' ? 3 : 5);
      expect(long[1]?.progress).toBeLessThan(long[0]?.progress ?? 0);
      expect(long.every(({ opacity }) => opacity === 1)).toBe(true);
    },
  );

  it('round-trips a phase and rejects invalid effect properties independently of other updates', () => {
    const from = { x: 0, y: 0, width: 200, height: 100 };
    const frameTransition: FrameTransitionPhase = {
      authoredPreset: true,
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
      readCgControl(
        withCgControl(
          {},
          {
            look: 'solo',
            frameTransition: null,
            presetTransitionCommit: true,
          },
        ),
      ),
    ).toEqual({ look: 'solo', frameTransition: null, presetTransitionCommit: true });
    expect(
      readCgControl({
        [CG_CONTROL_KEY]: { look: 'two', frameTransition: { ...frameTransition, durationMs: -1 } },
      }),
    ).toEqual({ look: 'two' });
    expect(
      FrameTransitionSchema.safeParse({ motion: 'cut', fade: true, durationMs: 0 }).success,
    ).toBe(false);
  });

  it('accepts immediate hiding and isolated artwork fades without a retained motion target', () => {
    const base = { durationMs: 0, easing: 'linear', frames: [] };
    expect(FrameTransitionPhaseSchema.safeParse(base).success).toBe(false);
    expect(
      FrameTransitionPhaseSchema.safeParse({
        ...base,
        authoredPreset: true,
        hidePresetArtworkKeys: ['outgoing/frame'],
      }).success,
    ).toBe(true);
    const phase = {
      ...base,
      authoredPreset: true,
      opacityArtwork: [{ key: 'incoming/frame', lookId: 'two', fromOpacity: 0, toOpacity: 1 }],
    };
    expect(FrameTransitionPhaseSchema.safeParse(phase).success).toBe(true);
    expect(
      FrameTransitionPhaseSchema.safeParse({ ...phase, authoredPreset: undefined }).success,
    ).toBe(false);
    expect(presetTransitionDurations(17, { exit: true, move: true, enter: true })).toEqual({
      exit: 6,
      move: 6,
      enter: 5,
    });
  });
});
