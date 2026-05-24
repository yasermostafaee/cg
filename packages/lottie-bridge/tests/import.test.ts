import { describe, expect, it } from 'vitest';
import { importLottie } from '../src/import.js';

/**
 * M8.2 — Lottie import feature allowlist.
 *
 * The tests below cover one allow case and a rejection per
 * RejectionCode. Sample JSONs are hand-crafted minimal payloads —
 * we don't need a real After Effects export to exercise the rules.
 */

function baseAnimation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: '5.7.4',
    fr: 50,
    ip: 0,
    op: 50,
    w: 1920,
    h: 1080,
    nm: 'fixture',
    ddd: 0,
    layers: [],
    assets: [],
    ...overrides,
  };
}

function layer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ty: 4,
    nm: 'shape-layer',
    ddd: 0,
    ks: {},
    ...overrides,
  };
}

describe('importLottie — happy path', () => {
  it('accepts a minimal shape-only animation', () => {
    const result = importLottie(baseAnimation({ layers: [layer()] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.animation.v).toBe('5.7.4');
      expect(result.animation.w).toBe(1920);
      expect(result.animation.nm).toBe('fixture');
    }
  });

  it('accepts solid + null + image + text + shape + precomp layers', () => {
    const result = importLottie(
      baseAnimation({
        layers: [
          layer({ ty: 0, nm: 'precomp' }),
          layer({ ty: 1, nm: 'solid' }),
          layer({ ty: 2, nm: 'image' }),
          layer({ ty: 3, nm: 'null' }),
          layer({ ty: 4, nm: 'shape' }),
          layer({ ty: 5, nm: 'text' }),
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('importLottie — rejections', () => {
  it('rejects malformed JSON (not an object)', () => {
    const result = importLottie('not an object');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejected[0]?.code).toBe('malformed-json');
    }
  });

  it('rejects JSON missing required fields', () => {
    const result = importLottie({ v: '5.7', fr: 30 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejected[0]?.code).toBe('malformed-json');
    }
  });

  it('rejects top-level 3D (ddd=1)', () => {
    const result = importLottie(baseAnimation({ ddd: 1, layers: [layer()] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejected.some((r) => r.code === 'three-d-layer')).toBe(true);
    }
  });

  it('rejects per-layer 3D (ddd=1 on a layer)', () => {
    const result = importLottie(baseAnimation({ layers: [layer({ ddd: 1, nm: 'bad' })] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.rejected.find((r) => r.code === 'three-d-layer');
      expect(issue?.layerName).toBe('bad');
    }
  });

  it('rejects unsupported layer types (audio ty=6, camera ty=13, light ty=15)', () => {
    const result = importLottie(
      baseAnimation({
        layers: [
          layer({ ty: 6, nm: 'audio' }),
          layer({ ty: 13, nm: 'camera' }),
          layer({ ty: 15, nm: 'light' }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const reasons = result.rejected
        .filter((r) => r.code === 'unsupported-layer-type')
        .map((r) => r.layerName);
      expect(reasons).toEqual(expect.arrayContaining(['audio', 'camera', 'light']));
    }
  });

  it('rejects layers with effects (ef array non-empty)', () => {
    const result = importLottie(
      baseAnimation({
        layers: [layer({ ef: [{ ty: 25, nm: 'gaussian-blur' }] })],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejected.some((r) => r.code === 'effect')).toBe(true);
    }
  });

  it('rejects layers containing expressions (property with x + k)', () => {
    const result = importLottie(
      baseAnimation({
        layers: [
          layer({
            ks: {
              p: { a: 0, k: [0, 0, 0], x: 'time * 100' },
            },
          }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejected.some((r) => r.code === 'expression')).toBe(true);
    }
  });

  it('rejects nested rejections inside precomp assets', () => {
    const result = importLottie(
      baseAnimation({
        layers: [layer({ ty: 0, nm: 'precomp', refId: 'nested-1' })],
        assets: [
          {
            id: 'nested-1',
            layers: [layer({ ty: 13, nm: 'nested-camera' })],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.rejected.some(
          (r) => r.code === 'unsupported-layer-type' && r.layerName === 'nested-camera',
        ),
      ).toBe(true);
    }
  });

  it('rejects audio assets even when no audio layer is present', () => {
    const result = importLottie(
      baseAnimation({
        layers: [layer()],
        assets: [{ id: 'a', ty: 'audio', p: 'foo.mp3' }],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejected.some((r) => r.code === 'audio-asset')).toBe(true);
    }
  });

  it('collects multiple rejections in a single pass (no early return)', () => {
    const result = importLottie(
      baseAnimation({
        ddd: 1,
        layers: [layer({ ty: 13, nm: 'cam' }), layer({ ef: [{ ty: 25 }] })],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.rejected.map((r) => r.code);
      expect(codes).toContain('three-d-layer');
      expect(codes).toContain('unsupported-layer-type');
      expect(codes).toContain('effect');
    }
  });
});
