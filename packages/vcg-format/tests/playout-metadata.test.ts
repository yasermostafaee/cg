import { describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { buildPlayoutMetadata } from '../src/playout-metadata.js';
import { fixtureScene } from './fixtures.js';

describe('buildPlayoutMetadata', () => {
  it('defaults to manual mode with no lifecycle fields', () => {
    expect(buildPlayoutMetadata(fixtureScene)).toEqual({ mode: 'manual' });
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

  it('emits holdSource only for content-driven holds (absent = timed)', () => {
    const scene: Scene = {
      ...fixtureScene,
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    };
    expect(buildPlayoutMetadata(scene)).toEqual({
      mode: 'auto-out',
      holdSource: 'content-driven',
    });
  });

  it("normalizes the LEGACY 'content-driven' mode into loop-cycle + content hold", () => {
    const scene = {
      ...fixtureScene,
      playout: { mode: 'content-driven', repeat: 2 },
    } as unknown as Scene;
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
