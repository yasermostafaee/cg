import { describe, expect, it } from 'vitest';
import { PlayoutSchema, playoutOf, SceneSchema } from '../src/scene.js';

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

describe('Scene — D-020 lifecycle / playout', () => {
  it('absent lifecycle + playout still validates (behaves as before)', () => {
    const s = SceneSchema.parse(minimalScene);
    expect(s.lifecycle).toBeUndefined();
    expect(s.playout).toBeUndefined();
  });

  it('accepts an out-point inside the active region', () => {
    // active = frameRange [0, 50] (no activeRange)
    const s = SceneSchema.parse({
      ...minimalScene,
      lifecycle: { outPoint: 40 },
    });
    expect(s.lifecycle).toEqual({ outPoint: 40 });
  });

  it('rejects an out-point beyond the active-region end', () => {
    expect(() => SceneSchema.parse({ ...minimalScene, lifecycle: { outPoint: 60 } })).toThrow(
      /lifecycle/,
    );
  });

  it('validates the out-point invariant against activeRange when present', () => {
    const within = { ...minimalScene, activeRange: { in: 10, out: 30 } };
    // out-point inside [10, 30] — valid
    expect(() => SceneSchema.parse({ ...within, lifecycle: { outPoint: 25 } })).not.toThrow();
    // out-point below activeRange.in — invalid even though it's ≥ frameRange.in (0)
    expect(() => SceneSchema.parse({ ...within, lifecycle: { outPoint: 5 } })).toThrow(/lifecycle/);
  });

  it('defaults playout.mode to manual', () => {
    const s = SceneSchema.parse({ ...minimalScene, playout: {} });
    expect(s.playout?.mode).toBe('manual');
  });

  it('accepts an auto-out playout with holdMs and repeat', () => {
    const s = SceneSchema.parse({
      ...minimalScene,
      playout: { mode: 'loop-cycle', holdMs: 2000, repeat: 3 },
    });
    expect(s.playout).toEqual({ mode: 'loop-cycle', holdMs: 2000, repeat: 3 });
  });

  it('accepts repeat: "infinite"', () => {
    const s = SceneSchema.parse({
      ...minimalScene,
      playout: { mode: 'loop-cycle', repeat: 'infinite' },
    });
    expect(s.playout?.repeat).toBe('infinite');
  });

  it('rejects negative holdMs and repeat < 1', () => {
    expect(() =>
      SceneSchema.parse({ ...minimalScene, playout: { mode: 'auto-out', holdMs: -1 } }),
    ).toThrow();
    expect(() =>
      SceneSchema.parse({ ...minimalScene, playout: { mode: 'loop-cycle', repeat: 0 } }),
    ).toThrow();
  });
});

describe('Scene — D-026 single project fps (no per-composition frameRate)', () => {
  const comp = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    name: 'Comp',
    resolution: { width: 1920, height: 1080 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent' as const,
    layers: [],
    ...over,
  });

  it('fps lives only on the Scene (the single project frame rate)', () => {
    const s = SceneSchema.parse({ ...minimalScene, frameRate: 25, compositions: [comp()] });
    expect(s.frameRate).toBe(25);
    // Compositions have no frameRate of their own.
    expect((s.compositions?.[0] as Record<string, unknown>).frameRate).toBeUndefined();
  });

  it('strips a legacy per-composition frameRate on load (coerced to the project fps)', () => {
    // A project authored before D-026 carried fps on each composition; parsing
    // drops it so every composition shares the single `Scene.frameRate`.
    const s = SceneSchema.parse({
      ...minimalScene,
      frameRate: 50,
      compositions: [comp({ frameRate: 25 })],
    });
    expect((s.compositions?.[0] as Record<string, unknown>).frameRate).toBeUndefined();
    expect(s.frameRate).toBe(50);
  });
});

describe('Playout — D-028 holdSource axis + legacy normalization', () => {
  it("normalizes legacy mode 'content-driven' to loop-cycle + content hold at parse time", () => {
    const parsed = PlayoutSchema.parse({ mode: 'content-driven', repeat: 3 });
    expect(parsed).toMatchObject({
      mode: 'loop-cycle',
      holdSource: 'content-driven',
      repeat: 3,
    });
  });

  it('accepts the two-axis form (mode x holdSource)', () => {
    const parsed = PlayoutSchema.parse({ mode: 'auto-out', holdSource: 'content-driven' });
    expect(parsed).toMatchObject({ mode: 'auto-out', holdSource: 'content-driven' });
  });

  it("playoutOf defensively normalizes an UNPARSED legacy object (old template.json)", () => {
    const legacy = { playout: { mode: 'content-driven', repeat: 2 } } as unknown as Parameters<
      typeof playoutOf
    >[0];
    expect(playoutOf(legacy)).toMatchObject({
      mode: 'loop-cycle',
      holdSource: 'content-driven',
      repeat: 2,
    });
  });

  it('playoutOf resolves an absent holdSource to timed', () => {
    expect(playoutOf({ playout: { mode: 'auto-out' } }).holdSource).toBe('timed');
    expect(playoutOf({}).holdSource).toBe('timed');
  });
});
