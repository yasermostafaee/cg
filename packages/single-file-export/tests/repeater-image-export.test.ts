import { describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { collectImageElements } from '../src/image-export.js';

describe('D-180 — dynamic Repeater image export closure', () => {
  it('collects image defaults and canonical image values in authored/list rows', () => {
    const scene = {
      schemaVersion: 1,
      id: 'weather',
      name: 'Weather',
      templateType: 'custom',
      resolution: { width: 1920, height: 1080 },
      frameRate: 50,
      safeAreas: { title: 10, action: 5 },
      frameRange: { in: 0, out: 50 },
      editorBackdrop: 'transparent',
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [
            {
              id: 'rep',
              name: 'Cities',
              type: 'repeater',
              visible: true,
              locked: false,
              opacity: 1,
              zIndex: 0,
              transform: {
                position: { x: 0, y: 0 },
                size: { w: 500, h: 500 },
                scale: { x: 1, y: 1 },
                rotation: 0,
                anchor: { x: 0, y: 0 },
              },
              compositionId: 'city-card',
              direction: 'column',
              flow: 'rtl',
              gap: 8,
              items: [{ id: 'r1', icon: { assetId: 'sunny' } }],
            },
          ],
        },
      ],
      fields: [
        {
          id: 'rows',
          label: 'Rows',
          required: false,
          type: 'list',
          default: [{ id: 'r1', icon: { assetId: 'rain' } }],
        },
      ],
      bindings: [{ fieldId: 'rows', target: { kind: 'repeater-items', elementId: 'rep' } }],
      fonts: [],
      compositions: [
        {
          id: 'city-card',
          name: 'City card',
          resolution: { width: 500, height: 100 },
          frameRange: { in: 0, out: 50 },
          editorBackdrop: 'transparent',
          layers: [],
          fields: [
            {
              id: 'icon',
              label: 'Icon',
              required: false,
              type: 'image',
              accept: ['png'],
              defaultAssetId: 'cloudy',
              assetOptions: [
                { assetId: 'project-choice', label: 'Project choice', source: 'project' },
                { assetId: 'shared-choice', label: 'Shared choice', source: 'shared' },
              ],
            },
          ],
          bindings: [],
        },
      ],
      metadata: {
        createdAt: '2026-11-03T00:00:00.000Z',
        updatedAt: '2026-11-03T00:00:00.000Z',
      },
    } as unknown as Scene;

    expect(new Set(collectImageElements(scene).map((ref) => ref.assetId))).toEqual(
      new Set(['sunny', 'rain', 'cloudy', 'project-choice', 'shared-choice']),
    );
    expect(collectImageElements(scene)).toContainEqual(
      expect.objectContaining({ assetId: 'shared-choice', source: 'shared' }),
    );
  });
});
