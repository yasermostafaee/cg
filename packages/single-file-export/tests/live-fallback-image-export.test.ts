import { describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { collectImageElements } from '../src/image-export.js';

describe('R-105 — live fallback image export closure', () => {
  it('packs the selected picture so the on-air fallback is never a broken asset', () => {
    const scene = {
      layers: [
        {
          children: [
            {
              id: 'plate-1',
              type: 'video-placeholder',
              posterAssetId: 'fallback-picture',
            },
          ],
        },
      ],
      compositions: [],
      fields: [],
    } as unknown as Scene;

    expect(collectImageElements(scene)).toContainEqual({
      elementId: 'plate-1',
      assetId: 'fallback-picture',
      source: 'project',
    });
  });
});
