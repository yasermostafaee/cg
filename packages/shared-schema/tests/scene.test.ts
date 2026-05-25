import { describe, expect, it } from 'vitest';
import { SceneSchema } from '../src/scene.js';

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 100, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

const baseElProps = {
  transform: baseTransform,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
};

const minimalScene = {
  schemaVersion: 1 as const,
  id: 'scene-1',
  name: 'newsroom-lt',
  templateType: 'lower-third' as const,
  resolution: { width: 1920, height: 1080 },
  frameRate: 50 as const,
  safeAreas: { title: 10, action: 5 },
  frameRange: { in: 0, out: 50 },
  background: 'transparent' as const,
  layers: [],
  fields: [],
  bindings: [],
  fonts: [],
  metadata: {
    createdAt: '2026-05-19T18:00:00.000Z',
    updatedAt: '2026-05-19T18:00:00.000Z',
  },
};

describe('Scene', () => {
  it('accepts a minimal empty scene', () => {
    expect(SceneSchema.parse(minimalScene).id).toBe('scene-1');
  });

  it('accepts a fully-populated lower-third', () => {
    const scene = {
      ...minimalScene,
      layers: [
        {
          id: 'L1',
          name: 'Background',
          visible: true,
          locked: false,
          blendMode: 'normal' as const,
          children: [
            {
              ...baseElProps,
              id: 'bg',
              name: 'bg-rect',
              type: 'shape' as const,
              shape: 'rounded-rect' as const,
              cornerRadius: 8,
              fill: { kind: 'solid' as const, color: '#0EA5E9' },
            },
            {
              ...baseElProps,
              id: 'name',
              name: 'anchor-name',
              type: 'text' as const,
              text: '{{anchor}}',
              font: {
                family: 'Vazirmatn',
                weight: 700,
                style: 'normal' as const,
                size: 48,
                lineHeight: 1.4,
                letterSpacing: 0,
              },
              color: '#FFFFFF',
              align: 'start' as const,
              direction: 'rtl' as const,
              fitMode: 'autosize' as const,
              overflow: 'ellipsis' as const,
            },
          ],
        },
      ],
      fields: [
        {
          id: 'anchor',
          label: 'Anchor name',
          required: true,
          type: 'text' as const,
          default: 'سارا نادری',
          direction: 'rtl' as const,
        },
      ],
      bindings: [
        {
          fieldId: 'anchor',
          target: { kind: 'text' as const, elementId: 'name', placeholder: '{{anchor}}' },
        },
      ],
      fonts: [
        {
          family: 'Vazirmatn',
          weights: [400, 500, 700],
          styles: ['normal' as const],
          source: 'bundled' as const,
          bundledPath: 'fonts/Vazirmatn.woff2',
        },
      ],
    };
    expect(SceneSchema.parse(scene).layers).toHaveLength(1);
  });

  it('rejects schemaVersion != 1', () => {
    expect(() => SceneSchema.parse({ ...minimalScene, schemaVersion: 2 })).toThrow();
  });

  it('accepts solid hex background', () => {
    const s = { ...minimalScene, background: '#000000' };
    expect(SceneSchema.parse(s).background).toBe('#000000');
  });
});
