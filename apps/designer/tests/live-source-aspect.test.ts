import { describe, expect, it } from 'vitest';
import type { Transform } from '@cg/shared-schema';
import { VideoPlaceholderElementSchema } from '@cg/shared-schema';
import {
  ASPECT_CUSTOM,
  ASPECT_PRESETS,
  ASPECT_TOLERANCE,
  ASPECT_UNSPECIFIED,
  effectiveAspect,
  fitToAspect,
  matchesAspect,
  optionLabelFor,
  presetKeyFor,
  presetValueFor,
} from '../src/renderer/features/inspector/aspect-presets.js';
import { defaultLiveSource } from '../src/renderer/state/element-defaults.js';

/**
 * D-147 — the aspect PRESETS and the fit action.
 *
 * Two things are worth testing and they are different in kind: the preset
 * round-trip (a labelling contract the author reads) and the fit arithmetic (the
 * geometry that can be silently wrong under non-uniform scale, and that must never
 * manufacture the off-frame preflight error it exists to help avoid).
 */

function tf(over: Partial<Transform> = {}): Transform {
  return {
    position: { x: 100, y: 100 },
    size: { w: 640, h: 360 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
    ...over,
  } as Transform;
}

const FRAME = { width: 1920, height: 1080 };

describe('D-147 — every preset round-trips to its number and back to its label', () => {
  it.each(ASPECT_PRESETS)('$key stores $value and reads back as $key', (preset) => {
    const stored = presetValueFor(preset.key);
    expect(stored).toBe(preset.value);
    expect(presetKeyFor(stored)).toBe(preset.key);
  });

  it('every label carries the ratio AND the decimal — the ambiguity that prompted this', () => {
    for (const p of ASPECT_PRESETS) {
      const label = optionLabelFor(p.key, p.value);
      expect(label).toContain(p.ratio);
      expect(label).toContain(p.value.toFixed(2));
    }
  });

  it('a value close to a preset still reads as that preset', () => {
    // An author who typed 1.78 meant 16:9 (1.7778). Within tolerance.
    expect(presetKeyFor(1.78)).toBe('16:9');
  });

  it('21:9 and 2.39:1 do NOT collapse into one another', () => {
    // 2.3333 vs 2.39 — 0.057 apart, which is what rules out a loose tolerance.
    expect(Math.abs(21 / 9 - 2.39)).toBeGreaterThan(ASPECT_TOLERANCE);
    expect(presetKeyFor(21 / 9)).toBe('21:9');
    expect(presetKeyFor(2.39)).toBe('2.39:1');
  });

  it('an OFF-preset stored number shows as Custom, with the number in the label', () => {
    expect(presetKeyFor(1.85)).toBe(ASPECT_CUSTOM);
    expect(optionLabelFor(ASPECT_CUSTOM, 1.85)).toContain('1.85');
  });

  it('absent reads as “not specified”, and that option is not a number', () => {
    expect(presetKeyFor(undefined)).toBe(ASPECT_UNSPECIFIED);
    expect(presetValueFor(ASPECT_UNSPECIFIED)).toBeUndefined();
    expect(optionLabelFor(ASPECT_UNSPECIFIED, undefined)).toBe('— not specified —');
  });
});

describe('D-147 — “not specified” is ABSENT, and the schema now permits it', () => {
  it('an element with no expectedAspect parses, and round-trips as absent', () => {
    const el = { ...defaultLiveSource('el-1', 0, 0), expectedAspect: undefined };
    const parsed = VideoPlaceholderElementSchema.parse(el);
    expect('expectedAspect' in parsed && parsed.expectedAspect !== undefined).toBe(false);
    expect(presetKeyFor(parsed.expectedAspect)).toBe(ASPECT_UNSPECIFIED);
  });

  it('a NEW element still defaults to 16:9 — the value did not change, only its display', () => {
    const el = defaultLiveSource('el-2', 0, 0);
    expect(el.expectedAspect).toBe(16 / 9);
    expect(presetKeyFor(el.expectedAspect)).toBe('16:9');
  });

  it('zero and negative are still refused — absent is a state, not a loosening', () => {
    const base = defaultLiveSource('el-3', 0, 0);
    expect(VideoPlaceholderElementSchema.safeParse({ ...base, expectedAspect: 0 }).success).toBe(
      false,
    );
    expect(VideoPlaceholderElementSchema.safeParse({ ...base, expectedAspect: -2 }).success).toBe(
      false,
    );
  });
});

describe('D-147 — the effective aspect accounts for NON-UNIFORM scale', () => {
  it('w/h alone is not the answer', () => {
    // 640×360 is 16:9 on paper; at scaleX 2 / scaleY 1 it RENDERS at 32:9.
    const t = tf({ scale: { x: 2, y: 1 } });
    expect(t.size.w / t.size.h).toBeCloseTo(16 / 9, 6);
    expect(effectiveAspect(t)).toBeCloseTo(32 / 9, 6);
    expect(matchesAspect(t, 16 / 9)).toBe(false);
    expect(matchesAspect(t, 32 / 9)).toBe(true);
  });
});

describe('D-147 — the fit solves for H, preserving X, Y and W', () => {
  it('uniform scale: 4:3 on a 640-wide plate gives h = 480', () => {
    const fit = fitToAspect(tf(), 4 / 3, FRAME);
    expect(fit?.preserved).toBe('width');
    expect(fit?.size.w).toBe(640);
    expect(fit?.size.h).toBeCloseTo(480, 6);
  });

  it('NON-uniform scale: h = (w·sx) / (aspect·sy), never (w / aspect)', () => {
    // sx 2, sy 1 ⇒ h must be twice what the naive form gives, or the RENDERED box
    // is the wrong shape while W and H look right in the inspector.
    const t = tf({ scale: { x: 2, y: 1 } });
    const fit = fitToAspect(t, 16 / 9, FRAME);
    expect(fit?.size.h).toBeCloseTo((640 * 2) / ((16 / 9) * 1), 6);
    // The proof: the fitted transform RENDERS at the requested aspect.
    expect(matchesAspect({ ...t, size: fit?.size ?? t.size }, 16 / 9)).toBe(true);
  });

  it('and again with sy ≠ 1, so a shared-scale assumption cannot pass', () => {
    const t = tf({ scale: { x: 1.5, y: 0.5 } });
    const fit = fitToAspect(t, 4 / 3, FRAME);
    expect(matchesAspect({ ...t, size: fit?.size ?? t.size }, 4 / 3)).toBe(true);
  });

  it('scale itself is NEVER touched — the action is about size', () => {
    const t = tf({ scale: { x: 1.5, y: 0.5 } });
    const fit = fitToAspect(t, 4 / 3, FRAME);
    // The fit returns a SIZE only; there is no scale in its result to write back.
    expect(Object.keys(fit ?? {}).sort()).toEqual(['preserved', 'size']);
  });
});

describe('D-147 — the bottom-edge flip never manufactures an off-frame error', () => {
  it('preserves H and solves for W when solving for H would overflow the bottom', () => {
    // A wide, low plate near the bottom: 9:16 needs a very tall box.
    const t = tf({ position: { x: 100, y: 900 }, size: { w: 640, h: 120 } });
    const fit = fitToAspect(t, 9 / 16, FRAME);
    expect(fit?.preserved).toBe('height');
    expect(fit?.size.h).toBe(120);
    expect(fit?.size.w).toBeCloseTo((120 * 1 * (9 / 16)) / 1, 6);
    // The result is inside the frame, which is the whole point of the flip.
    expect((fit?.size.h ?? 0) + t.position.y).toBeLessThanOrEqual(FRAME.height);
    expect(matchesAspect({ ...t, size: fit?.size ?? t.size }, 9 / 16)).toBe(true);
  });

  it('the bottom edge is measured through the ANCHOR and scale, not as y + h', () => {
    // anchor 0.5 + scaleY 2 ⇒ the box grows about its middle, so its bottom sits at
    // y + h·(0.5 + 2·0.5) = y + 1.5h. Treating it as y + h·2 or y + h would flip at
    // the wrong moment — either refusing a legal fit or producing an illegal one.
    const t = tf({
      position: { x: 100, y: 700 },
      size: { w: 640, h: 200 },
      scale: { x: 1, y: 2 },
      anchor: { x: 0.5, y: 0.5 },
    });
    // Requested h = (640·1) / (1 · 2) = 320 ⇒ bottom = 700 + 320·1.5 = 1180 > 1080.
    const fit = fitToAspect(t, 1, FRAME);
    expect(fit?.preserved).toBe('height');
  });

  it('an ordinary mid-frame plate is NOT flipped', () => {
    expect(fitToAspect(tf(), 4 / 3, FRAME)?.preserved).toBe('width');
  });

  it('a degenerate scale yields no fit rather than a nonsense size', () => {
    expect(fitToAspect(tf({ scale: { x: 0, y: 1 } }), 16 / 9, FRAME)).toBeNull();
    expect(fitToAspect(tf(), 0, FRAME)).toBeNull();
  });
});

describe('D-147 — “already matches” is what disables the action', () => {
  it('a 640×360 plate at scale 1 already renders 16:9', () => {
    expect(matchesAspect(tf(), 16 / 9)).toBe(true);
  });

  it('a plate dragged off-ratio does not', () => {
    expect(matchesAspect(tf({ size: { w: 640, h: 400 } }), 16 / 9)).toBe(false);
  });
});
