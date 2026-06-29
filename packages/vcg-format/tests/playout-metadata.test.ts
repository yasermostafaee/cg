import { describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { buildPlayoutMetadata } from '../src/playout-metadata.js';
import { fixtureScene } from './fixtures.js';

/**
 * B-032 ext — `buildPlayoutMetadata` resolves a content-driven hold to timed when there are no
 * effective content drivers, so tests that genuinely want a content-driven hold need a real driver.
 * This appends a ticker to the scene's first layer.
 */
function withContentDriver(base: Scene): Scene {
  const layer0 = base.layers[0];
  if (!layer0) throw new Error('fixture missing layer 0');
  const ticker = {
    id: 'tk',
    name: 'tk',
    type: 'ticker',
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 400, h: 60 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal',
      size: 36,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    direction: 'rtl',
    speed: 100,
    gap: 10,
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    items: [{ id: 'a', text: 'x' }],
  };
  return {
    ...base,
    layers: [{ ...layer0, children: [...layer0.children, ticker] }, ...base.layers.slice(1)],
  } as unknown as Scene;
}

describe('buildPlayoutMetadata', () => {
  it('D-114 — a scene with no lifecycle (no out-point) exports as static mode', () => {
    // No out-point ⇒ static (preview == export); playoutOf resolves the default to static.
    expect(buildPlayoutMetadata(fixtureScene)).toEqual({ mode: 'static' });
  });

  it('carries the out-point, timing, and the outro duration in ms', () => {
    // fixtureScene: frameRate 50, frameRange [0, 50] (active = full range).
    const scene: Scene = {
      ...fixtureScene,
      lifecycle: { outPoint: 40 },
      playout: { mode: 'loop-cycle', holdMs: 2000, repeat: 3 },
    };
    expect(buildPlayoutMetadata(scene)).toEqual({
      mode: 'loop-cycle',
      holdMs: 2000,
      repeat: 3,
      outPoint: 40,
      // (50 - 40) / 50 fps * 1000 = 200 ms
      outroDurationMs: 200,
    });
  });

  it('emits holdSource for a content-driven hold WITH a content driver (absent = timed)', () => {
    // B-032 ext — content-driven is baked only when there are real drivers; add a ticker so the hold
    // is genuinely content-driven (a content-LESS content-driven hold resolves to timed — see below).
    const scene = withContentDriver({
      ...fixtureScene,
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    } as Scene);
    expect(buildPlayoutMetadata(scene)).toEqual({
      mode: 'auto-out',
      holdSource: 'content-driven',
    });
  });

  it('B-032 ext — a CONTENT-LESS content-driven hold resolves to timed (no holdSource baked, holdMs honored)', () => {
    // fixtureScene has no content sources, so a stored content-driven hold is zero-length: it resolves
    // to timed (matching the runtime), so no `holdSource` is baked and the authored `holdMs` ships.
    const scene: Scene = {
      ...fixtureScene,
      lifecycle: { outPoint: 40 },
      playout: { mode: 'auto-out', holdSource: 'content-driven', holdMs: 5000 },
    };
    const meta = buildPlayoutMetadata(scene);
    expect(meta.holdSource).toBeUndefined(); // resolved to timed (not content-driven)
    expect(meta.holdMs).toBe(5000);
    expect(meta.mode).toBe('auto-out');
  });

  it("normalizes the LEGACY 'content-driven' mode into loop-cycle + content hold", () => {
    // With a real driver so the normalized content-driven hold survives the B-032 resolution.
    const scene = withContentDriver({
      ...fixtureScene,
      playout: { mode: 'content-driven', repeat: 2 },
    } as unknown as Scene);
    expect(buildPlayoutMetadata(scene)).toEqual({
      mode: 'loop-cycle',
      holdSource: 'content-driven',
      repeat: 2,
    });
  });

  it('computes the outro duration against activeRange when set', () => {
    const scene: Scene = {
      ...fixtureScene,
      activeRange: { in: 0, out: 30 },
      lifecycle: { outPoint: 20 },
      playout: { mode: 'auto-out', holdMs: 1000 },
    };
    // (30 - 20) / 50 fps * 1000 = 200 ms
    expect(buildPlayoutMetadata(scene).outroDurationMs).toBe(200);
  });

  it('B-032 — bakes a STORED holdMs for a content-less auto-out AND loop-cycle (not 0)', () => {
    // The inspector now persists the timed `holdMs` onto `scene.playout`, so a standalone
    // export carries the authored hold (both the baked metadata here AND the inlined scene
    // the runtime reads). fixtureScene has no content sources.
    for (const mode of ['auto-out', 'loop-cycle'] as const) {
      const scene: Scene = {
        ...fixtureScene,
        lifecycle: { outPoint: 40 },
        playout: { mode, holdMs: 8000 },
      };
      const meta = buildPlayoutMetadata(scene);
      expect(meta.mode).toBe(mode);
      expect(meta.holdMs).toBe(8000); // exported ⇒ a standalone export holds for the authored duration
    }
  });
});
