import { describe, expect, it } from 'vitest';
import {
  CG_CONTROL_KEY,
  FrameTransitionPhaseSchema,
  FrameTransitionSchema,
  InputTransitionDirectionSchema,
  InputTransitionSchema,
  inputSlideVector,
  frameTransitionPhases,
  frameTransitionProgress,
  presetDepartureRect,
  presetTransitionDurations,
  readCgControl,
  withCgControl,
  type FrameTransitionPhase,
} from '../src/index.js';

describe('live frame transitions', () => {
  it('keeps legacy fades and translates independent arrival and departure directions', () => {
    const legacy = { motion: 'ease-in-out', fade: false, durationMs: 400 } as const;
    expect(FrameTransitionSchema.parse(legacy)).toEqual(legacy);
    const from = { x: 100, y: 200, width: 500, height: 400 };
    const raster = { width: 1920, height: 1080 };
    const positions = {
      left: { x: -1820, y: 200 },
      right: { x: 2020, y: 200 },
      up: { x: 100, y: -880 },
      down: { x: 100, y: 1280 },
    };
    for (const direction of InputTransitionDirectionSchema.options) {
      expect(
        FrameTransitionSchema.parse({ ...legacy, exitDirection: direction }).exitDirection,
      ).toBe(direction);
      expect(
        FrameTransitionSchema.parse({ ...legacy, enterDirection: direction }).enterDirection,
      ).toBe(direction);
      expect(presetDepartureRect(from, direction, raster)).toEqual({
        ...from,
        ...positions[direction],
      });
    }
    expect(
      FrameTransitionSchema.parse({ ...legacy, exitDirection: 'up', enterDirection: 'left' }),
    ).toEqual({ ...legacy, exitDirection: 'up', enterDirection: 'left' });
    for (const key of ['exitDirection', 'enterDirection'])
      expect(FrameTransitionSchema.safeParse({ ...legacy, [key]: 'diagonal' }).success).toBe(false);
  });

  it('accepts only a dedicated authored Focus slide phase with forward progress', () => {
    const focusSlide: NonNullable<FrameTransitionPhase['focusSlide']> = {
      viewport: { x: 40, y: 20, width: 1840, height: 1040 },
      axis: 'x',
      sign: 1,
      mode: 'push',
      fromProgress: 0.5,
      toProgress: 1,
    };
    const phase: FrameTransitionPhase = {
      authoredPreset: true,
      destinationLookId: 'guest-two',
      durationMs: 200,
      easing: 'linear',
      frames: [],
      focusSlide,
    };
    expect(readCgControl(withCgControl({}, { frameTransition: phase }))?.frameTransition).toEqual(
      phase,
    );
    for (const invalid of [
      { ...phase, destinationLookId: undefined },
      { ...phase, authoredPreset: undefined },
      { ...phase, hidePresetTitlePlateIds: ['guest'] },
      { ...phase, focusSlide: { ...focusSlide, toProgress: 0 } },
      { ...phase, focusSlide: { ...focusSlide, sign: 0 } },
    ]) {
      expect(FrameTransitionPhaseSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('round-trips complete Focus artwork and requires its authored destination', () => {
    const rect = { x: 0, y: 0, width: 1920, height: 1080 };
    const side = { base: rect, from: rect, to: rect, fromOpacity: 1, toOpacity: 0 };
    const phase: FrameTransitionPhase = {
      authoredPreset: true,
      destinationLookId: 'guest-two',
      durationMs: 200,
      easing: 'linear',
      frames: [],
      focusArtwork: {
        outgoing: { ...side, cover: { from: rect, to: rect, fromOpacity: 1, toOpacity: 0 } },
        incoming: { ...side, fromOpacity: 0, toOpacity: 1 },
        incomingAbove: true,
      },
    };
    expect(readCgControl(withCgControl({}, { frameTransition: phase }))?.frameTransition).toEqual(
      phase,
    );
    for (const invalid of [
      { ...phase, authoredPreset: undefined },
      { ...phase, destinationLookId: undefined },
      { ...phase, focusArtwork: { ...phase.focusArtwork, outgoing: { ...side, toOpacity: 2 } } },
      {
        ...phase,
        focusArtwork: { ...phase.focusArtwork, outgoing: { ...side, base: { ...rect, width: 0 } } },
      },
      {
        ...phase,
        focusSlide: {
          viewport: rect,
          axis: 'x',
          sign: 1,
          mode: 'push',
          fromProgress: 0,
          toProgress: 1,
        },
      },
    ])
      expect(FrameTransitionPhaseSchema.safeParse(invalid).success).toBe(false);
  });

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

  it.each(['cut', 'linear', 'ease-in-out'] as const)(
    '%s uses the exact odd channel-frame budget with Fade',
    (motion) => {
      const steps = frameTransitionPhases({ motion, fade: true, durationMs: 400 }, 9);
      expect(steps.reduce((sum, step) => sum + step.frames, 0)).toBe(9);
      expect(steps[0]?.opacity).toBe(0);
      expect(steps.at(-1)?.opacity).toBe(1);
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

  it('retains a native border suppression list and its explicit release', () => {
    for (const nativeBorderPlateIds of [['plate-1'], []]) {
      expect(readCgControl(withCgControl({}, { nativeBorderPlateIds }))).toEqual({
        nativeBorderPlateIds,
      });
    }
    for (const nativeBorderPlateIds of [['bad space'], [12], Array(129).fill('plate')]) {
      expect(readCgControl({ [CG_CONTROL_KEY]: { look: 'two', nativeBorderPlateIds } })).toEqual({
        look: 'two',
      });
    }
  });

  it('decodes native border retirement as an exclusive command', () => {
    expect(readCgControl(withCgControl({}, { releaseNativeBorderEffectId: 'edge-17' }))).toEqual({
      releaseNativeBorderEffectId: 'edge-17',
    });
    for (const releaseNativeBorderEffectId of ['', 17, 'x'.repeat(257)]) {
      expect(
        readCgControl({ [CG_CONTROL_KEY]: { look: 'other', releaseNativeBorderEffectId } }),
      ).toEqual({ releaseNativeBorderEffectId: '' });
    }
    expect(
      readCgControl({
        [CG_CONTROL_KEY]: { look: 'other', releaseNativeBorderEffectId: 'edge-17' },
      }),
    ).toEqual({ releaseNativeBorderEffectId: 'edge-17' });
  });

  it('accepts immediate hiding and isolated artwork fades without a retained motion target', () => {
    const base = { durationMs: 0, easing: 'linear', frames: [] };
    expect(FrameTransitionPhaseSchema.safeParse(base).success).toBe(false);
    const titleHold = { ...base, hidePresetTitlePlateIds: ['guest'] };
    expect(FrameTransitionPhaseSchema.safeParse(titleHold).success).toBe(false);
    expect(
      readCgControl(
        withCgControl(
          {},
          { frameTransition: { ...titleHold, easing: 'linear', authoredPreset: true } },
        ),
      )?.frameTransition?.hidePresetTitlePlateIds,
    ).toEqual(['guest']);
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
    const decorationOpacity = [
      {
        plateId: 'guest',
        border: { fromOpacity: 0, toOpacity: 1 },
        title: { fromOpacity: 1, toOpacity: 0 },
      },
    ];
    const decorationFade = {
      ...base,
      easing: 'linear',
      authoredPreset: true,
      decorationOpacity,
    } as const;
    expect(
      readCgControl(
        withCgControl(
          {},
          {
            frameTransition: {
              ...decorationFade,
              decorationOpacity,
            },
          },
        ),
      )?.frameTransition?.decorationOpacity,
    ).toEqual(decorationOpacity);
    expect(
      FrameTransitionPhaseSchema.safeParse({
        ...decorationFade,
        decorationOpacity: [{ plateId: 'guest' }],
      }).success,
    ).toBe(false);
    expect(
      FrameTransitionPhaseSchema.safeParse({
        ...decorationFade,
        authoredPreset: undefined,
      }).success,
    ).toBe(false);
    expect(presetTransitionDurations(17, { exit: true, move: true, enter: true })).toEqual({
      exit: 6,
      move: 6,
      enter: 5,
    });
  });
});

describe('input transitions', () => {
  it('accepts older Fade requests and four unambiguous input entry directions', () => {
    expect(InputTransitionSchema.parse({ mode: 'fade', durationMs: 400 })).toEqual({
      mode: 'fade',
      durationMs: 400,
    });
    expect(inputSlideVector()).toEqual({ x: -1, y: 0 });
    expect(
      InputTransitionDirectionSchema.options.map((direction) => inputSlideVector(direction)),
    ).toEqual([
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    ]);
    expect(
      InputTransitionSchema.safeParse({ mode: 'push', durationMs: 400, direction: 'top' }).success,
    ).toBe(false);
    expect(
      InputTransitionSchema.parse({ mode: 'slide-over', durationMs: 600, direction: 'down' }),
    ).toEqual({ mode: 'slide-over', durationMs: 600, direction: 'down' });
  });
});
