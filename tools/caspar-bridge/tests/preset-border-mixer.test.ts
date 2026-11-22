import type { FrameTransitionPhase } from '@cg/shared-schema';
import { describe, expect, it } from 'vitest';
import {
  nativePresetBorderStep,
  planNativePresetBorders,
  type NativePresetBorderLook,
} from '../src/preset-border-mixer.js';

const left = { x: 10, y: 20, width: 400, height: 250 };
const right = { x: 500, y: 20, width: 400, height: 250 };
const above = { ...left, y: -1000 };

function look(
  id: string,
  rects: NativePresetBorderLook['rects'],
  hidden: string[] = [],
): NativePresetBorderLook {
  return {
    id,
    rects,
    transitionFrames: Object.fromEntries(
      Object.keys(rects).map((plateId) => [plateId, { frameKey: id + ':' + plateId }]),
    ),
    borderVisible: (plateId) => !hidden.includes(plateId),
  };
}

function frame(
  plateId: string,
  lookId: string,
  from = left,
  to = right,
): FrameTransitionPhase['frames'][number] {
  return { frameKey: lookId + ':' + plateId, lookId, from, to, fromOpacity: 1, toOpacity: 1 };
}

const phase: FrameTransitionPhase = { durationMs: 120, easing: 'linear', frames: [] };

describe('native preset border planning', () => {
  it('starts arrivals hidden and moves entering and leaving strokes with their respective picture fades', () => {
    const [departure, arrival] = planNativePresetBorders({
      fromLook: look('old', { outgoing: left }),
      toLook: look('new', { incoming: right }),
      retained: [],
      retainedFade: false,
      departure: {
        plateIds: ['outgoing'],
        nativePlateIds: new Set(['outgoing']),
        slideFrames: [frame('outgoing', 'old', left, above)],
      },
      arrival: {
        plateIds: ['incoming'],
        nativePlateIds: new Set(['incoming']),
        slideFrames: [frame('incoming', 'new', above, right)],
      },
      colorOf: () => '#01fa88ff',
    });
    expect(departure).toMatchObject({
      phase: 'departure',
      from: left,
      to: above,
      initialOpacity: 1,
      color: '#01fa88',
    });
    expect(arrival).toMatchObject({
      phase: 'arrival',
      from: above,
      to: right,
      initialOpacity: 0,
    });
    expect(nativePresetBorderStep(departure!, 'departure', phase, 40)).toMatchObject({
      rect: above,
      frames: 3,
      opacity: 0,
    });
    expect(nativePresetBorderStep(arrival!, 'arrival', phase, 40)).toMatchObject({
      rect: right,
      frames: 3,
      opacity: 1,
    });
    expect(nativePresetBorderStep(arrival!, 'departure', phase, 40)).toBeUndefined();
  });

  it('keeps geometry stationary for fade-only groups and cuts an immediately hidden border', () => {
    const [out, blocked, incoming] = planNativePresetBorders({
      fromLook: look('old', { fade: left, blocked: right }),
      toLook: look('new', { incoming: right }),
      retained: [],
      retainedFade: false,
      departure: {
        plateIds: ['fade', 'blocked'],
        nativePlateIds: new Set(['fade', 'blocked']),
        immediatelyHidden: new Set(['blocked']),
        slideFrames: [frame('blocked', 'old', right, above)],
      },
      arrival: {
        plateIds: ['incoming'],
        nativePlateIds: new Set(['incoming']),
      },
      colorOf: () => '#ffffff',
    });
    expect(nativePresetBorderStep(out!, 'departure', phase, 40)).toMatchObject({
      rect: left,
      frames: 3,
      opacity: 0,
    });
    expect(nativePresetBorderStep(blocked!, 'departure', phase, 40)).toMatchObject({
      rect: right,
      frames: 0,
      opacity: 0,
    });
    expect(nativePresetBorderStep(incoming!, 'arrival', phase, 40)).toMatchObject({
      rect: right,
      frames: 3,
      opacity: 1,
    });
  });

  it('keeps author-hidden, fallback-only, and translucent strokes in their existing rendering path', () => {
    expect(
      planNativePresetBorders({
        fromLook: look('old', { shared: left, fallback: left, hidden: right }, ['hidden', 'shared']),
        toLook: look('new', { shared: right, incoming: left, alpha: right }, ['shared']),
        retained: [{ plateId: 'shared', frame: frame('shared', 'old') }],
        retainedFade: true,
        departure: {
          plateIds: ['fallback', 'hidden'],
          nativePlateIds: new Set(['hidden']),
        },
        arrival: {
          plateIds: ['incoming', 'alpha'],
          nativePlateIds: new Set(['alpha']),
        },
        colorOf: (plateId) => (plateId === 'alpha' ? '#ffffff80' : '#ffffff'),
      }),
    ).toEqual([]);
  });

  it('fades only the native stroke, including a retained plate without a geometric move', () => {
    for (const startVisible of [false, true]) {
      const motion = frame('host', 'old', left, left);
      const [border] = planNativePresetBorders({
        fromLook: look('old', { host: left }, startVisible ? [] : ['host']),
        toLook: look('new', { host: left }, startVisible ? ['host'] : []),
        retained: [{ plateId: 'host', frame: motion }],
        retainedFade: false,
        colorOf: () => '#112233',
      });
      expect(border?.color).toBe('#112233');
      expect(Boolean(border?.strokeInitiallyHidden)).toBe(!startVisible);
      const step = nativePresetBorderStep(border!, 'move', {
        ...phase, frames: [motion], decorationOpacity: [{
          plateId: 'host', border: { fromOpacity: Number(startVisible), toOpacity: 0.75 },
        }],
      }, 40);
      expect(step).toMatchObject({ rect: left, frames: 3, opacity: 1, strokeOpacity: 0.75 });
    }
  });

  it('applies a retained fade even if the frame stays stationary', () => {
    const move = { ...frame('shared', 'old', left, left), toOpacity: 0.5 };
    const [shared] = planNativePresetBorders({
      fromLook: look('old', { shared: left }),
      toLook: look('new', { shared: left }),
      retained: [{ plateId: 'shared', frame: move }],
      retainedFade: true,
      colorOf: () => '#ffffff',
    });
    expect(nativePresetBorderStep(shared!, 'move', { ...phase, frames: [move] }, 40)).toMatchObject(
      {
        rect: left,
        frames: 3,
        opacity: 0.5,
      },
    );
  });

  it('moves visible fallback when borders are hidden on both an arriving and departing plate', () => {
    const departing = { ...look('focus', { guest: left }, ['guest']), fallbacks: ['guest'] };
    const arriving = { ...look('preset', { host: right }, ['host']), fallbacks: ['host'] };
    const plans = planNativePresetBorders({
      fromLook: departing,
      toLook: arriving,
      retained: [],
      retainedFade: false,
      departure: {
        plateIds: ['guest'],
        nativePlateIds: new Set(['guest']),
        slideFrames: [frame('guest', 'focus', left, above)],
      },
      arrival: {
        plateIds: ['host'],
        nativePlateIds: new Set(['host']),
        slideFrames: [frame('host', 'preset', above, right)],
      },
      colorOf: () => '#ffffff',
    });
    expect(plans.map(({ phase, from, to, color }) => ({ phase, from, to, color }))).toEqual([
      { phase: 'departure', from: left, to: above, color: undefined },
      { phase: 'arrival', from: above, to: right, color: undefined },
    ]);
  });
});
