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
});
