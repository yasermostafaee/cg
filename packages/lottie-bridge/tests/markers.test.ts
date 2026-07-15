import { describe, expect, it } from 'vitest';
import { importLottie, markersToSegments, type LottieAnimation } from '../src/import.js';

/**
 * D-125 §D1.2 — the bodymovin `markers` → phase-segment mapping. A valid set
 * yields `{ source: 'markers', introEnd, outroStart, idleIn, idleOut }`; anything
 * incomplete / out of order / out of range yields `null` so the caller falls back
 * to manual marking.
 */

function anim(markers: unknown[], over: Partial<LottieAnimation> = {}): LottieAnimation {
  const result = importLottie({
    v: '5.7',
    fr: 30,
    ip: 0,
    op: 100,
    w: 1920,
    h: 1080,
    nm: 'fixture',
    ddd: 0,
    layers: [],
    assets: [],
    markers,
  });
  if (!result.ok) throw new Error('fixture should import');
  return { ...result.animation, ...over };
}

describe('markersToSegments — valid sets', () => {
  it('reads intro-end / outro-start into segments (idle defaults to the hold window)', () => {
    const seg = markersToSegments(
      anim([
        { tm: 20, cm: 'intro-end', dr: 0 },
        { tm: 80, cm: 'outro-start', dr: 0 },
      ]),
    );
    expect(seg).toEqual({
      source: 'markers',
      introEnd: 20,
      outroStart: 80,
      idleIn: 20,
      idleOut: 80,
    });
  });

  it('accepts camelCase and short aliases (introEnd / out) case-insensitively', () => {
    const seg = markersToSegments(
      anim([
        { tm: 15, cm: ' introEnd ', dr: 0 },
        { tm: 75, cm: 'OUT', dr: 0 },
      ]),
    );
    expect(seg?.introEnd).toBe(15);
    expect(seg?.outroStart).toBe(75);
  });

  it('reads an explicit idle / hold segment inside the hold window', () => {
    const seg = markersToSegments(
      anim([
        { tm: 20, cm: 'intro-end', dr: 0 },
        { tm: 30, cm: 'idle-start', dr: 0 },
        { tm: 60, cm: 'hold-end', dr: 0 },
        { tm: 80, cm: 'outro-start', dr: 0 },
      ]),
    );
    expect(seg).toMatchObject({ introEnd: 20, outroStart: 80, idleIn: 30, idleOut: 60 });
  });

  it('ignores an out-of-range idle pair and defaults to the hold window', () => {
    const seg = markersToSegments(
      anim([
        { tm: 20, cm: 'intro-end', dr: 0 },
        { tm: 90, cm: 'idle-start', dr: 0 }, // past outroStart — invalid
        { tm: 95, cm: 'idle-end', dr: 0 },
        { tm: 80, cm: 'outro-start', dr: 0 },
      ]),
    );
    expect(seg).toMatchObject({ idleIn: 20, idleOut: 80 });
  });
});

describe('markersToSegments — fall back to manual (null)', () => {
  it('no markers → null', () => {
    expect(markersToSegments(anim([]))).toBeNull();
  });

  it('a missing boundary → null', () => {
    expect(markersToSegments(anim([{ tm: 20, cm: 'intro-end', dr: 0 }]))).toBeNull();
  });

  it('unrecognised names → null', () => {
    expect(
      markersToSegments(
        anim([
          { tm: 20, cm: 'chapter 1', dr: 0 },
          { tm: 80, cm: 'chapter 2', dr: 0 },
        ]),
      ),
    ).toBeNull();
  });

  it('out-of-order boundaries (introEnd > outroStart) → null', () => {
    expect(
      markersToSegments(
        anim([
          { tm: 80, cm: 'intro-end', dr: 0 },
          { tm: 20, cm: 'outro-start', dr: 0 },
        ]),
      ),
    ).toBeNull();
  });

  it('out-of-range boundary (outroStart > op) → null', () => {
    expect(
      markersToSegments(
        anim([
          { tm: 20, cm: 'intro-end', dr: 0 },
          { tm: 200, cm: 'outro-start', dr: 0 },
        ]),
      ),
    ).toBeNull();
  });
});

describe('importLottie — markers metadata', () => {
  it('exposes well-formed markers and skips malformed ones', () => {
    const result = importLottie({
      v: '5.7',
      fr: 30,
      ip: 0,
      op: 100,
      w: 10,
      h: 10,
      nm: 'm',
      ddd: 0,
      layers: [],
      assets: [],
      markers: [
        { tm: 20, cm: 'intro-end', dr: 0 },
        { cm: 'no-tm' }, // malformed — skipped
        { tm: 80, cm: 'outro-start' }, // dr absent → defaults 0
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.animation.markers).toEqual([
        { tm: 20, cm: 'intro-end', dr: 0 },
        { tm: 80, cm: 'outro-start', dr: 0 },
      ]);
    }
  });
});
