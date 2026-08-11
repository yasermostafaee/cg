import { describe, expect, it } from 'vitest';
import { hasEffectiveHoldDrivers, PlayoutSchema, playoutOf, SceneSchema } from '../src/scene.js';

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
  editorBackdrop: 'transparent' as const,
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

  it('accepts a solid hex editor backdrop', () => {
    const s = { ...minimalScene, editorBackdrop: '#000000' };
    expect(SceneSchema.parse(s).editorBackdrop).toBe('#000000');
  });

  // B-129 — the legacy spelling is normalized at parse time, so every stored scene
  // loads unchanged and the parsed object carries NO `background` field at all. That
  // absence is the point: it is what makes an editor preference unable to reach the
  // render path by a name the renderer might still read.
  it('normalizes a legacy `background` key onto `editorBackdrop`', () => {
    // A genuinely pre-B-129 scene carries `background` and NO `editorBackdrop` — so
    // the new key must be REMOVED from the fixture here, not merely shadowed. Leaving
    // it in tests the "explicit wins" rule below instead, which is a different claim.
    const { editorBackdrop: _absent, ...legacyScene } = minimalScene;
    const parsed = SceneSchema.parse({ ...legacyScene, background: '#123456' });
    expect(parsed.editorBackdrop).toBe('#123456');
    expect(Object.hasOwn(parsed, 'background')).toBe(false);
  });

  it('lets an explicit `editorBackdrop` WIN over a stale `background`', () => {
    // A re-save must never be undone by a key an older writer left behind.
    const parsed = SceneSchema.parse({
      ...minimalScene,
      editorBackdrop: '#123456',
      editorBackdrop: 'transparent',
    });
    expect(parsed.editorBackdrop).toBe('transparent');
    expect(Object.hasOwn(parsed, 'background')).toBe(false);
  });

  it('normalizes the legacy key on COMPOSITIONS too, not just the scene root', () => {
    const comp = {
      id: 'c1',
      name: 'c',
      resolution: { width: 100, height: 100 },
      frameRange: { in: 0, out: 10 },
      editorBackdrop: '#ABCDEF',
      layers: [],
    };
    const parsed = SceneSchema.parse({ ...minimalScene, compositions: [comp] });
    expect(parsed.compositions?.[0]?.editorBackdrop).toBe('#ABCDEF');
    expect(Object.hasOwn(parsed.compositions?.[0] ?? {}, 'background')).toBe(false);
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

  // D-104 follow-up — the OPTIONAL content-start marker, symmetric to outPoint.
  it('accepts an optional content-start inside [in, outPoint] and round-trips through JSON', () => {
    const raw = { ...minimalScene, lifecycle: { outPoint: 40, contentStart: 12 } };
    const s = SceneSchema.parse(raw);
    expect(s.lifecycle).toEqual({ outPoint: 40, contentStart: 12 });
    // non-breaking serialization: stringify → parse yields the same lifecycle.
    expect(SceneSchema.parse(JSON.parse(JSON.stringify(s))).lifecycle).toEqual({
      outPoint: 40,
      contentStart: 12,
    });
  });

  it('content-start is OPTIONAL — an out-point without one stays valid (non-breaking, no version bump)', () => {
    const s = SceneSchema.parse({ ...minimalScene, lifecycle: { outPoint: 40 } });
    expect(s.lifecycle).toEqual({ outPoint: 40 });
    expect(s.lifecycle?.contentStart).toBeUndefined();
  });

  it('accepts a content-start AT either boundary (in or outPoint)', () => {
    expect(() =>
      SceneSchema.parse({ ...minimalScene, lifecycle: { outPoint: 40, contentStart: 0 } }),
    ).not.toThrow();
    expect(() =>
      SceneSchema.parse({ ...minimalScene, lifecycle: { outPoint: 40, contentStart: 40 } }),
    ).not.toThrow();
  });

  it('rejects a content-start AFTER the out-point', () => {
    expect(() =>
      SceneSchema.parse({ ...minimalScene, lifecycle: { outPoint: 40, contentStart: 41 } }),
    ).toThrow(/contentStart/);
  });

  it('rejects a content-start before active.in (validated against activeRange)', () => {
    const within = { ...minimalScene, activeRange: { in: 10, out: 30 } };
    expect(() =>
      SceneSchema.parse({ ...within, lifecycle: { outPoint: 25, contentStart: 5 } }),
    ).toThrow(/contentStart/);
    // inside [10, 25] — valid
    expect(() =>
      SceneSchema.parse({ ...within, lifecycle: { outPoint: 25, contentStart: 15 } }),
    ).not.toThrow();
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
    editorBackdrop: 'transparent' as const,
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

  it('playoutOf defensively normalizes an UNPARSED legacy object (old template.json)', () => {
    // An out-point is present, so the mode resolves to the legacy-normalized value (not D-114 static).
    const legacy = {
      playout: { mode: 'content-driven', repeat: 2 },
      lifecycle: { outPoint: 30 },
    } as unknown as Parameters<typeof playoutOf>[0];
    expect(playoutOf(legacy)).toMatchObject({
      mode: 'loop-cycle',
      holdSource: 'content-driven',
      repeat: 2,
    });
  });

  it('playoutOf resolves an absent holdSource to timed', () => {
    // (an out-point present so the auto-out mode survives; holdSource is the field under test)
    expect(
      playoutOf({ playout: { mode: 'auto-out' }, lifecycle: { outPoint: 10 } }).holdSource,
    ).toBe('timed');
    expect(playoutOf({}).holdSource).toBe('timed');
  });

  it('D-114 — playoutOf resolves a no-out-point DEFAULT composition to static', () => {
    // No lifecycle + the default (manual/absent) mode ⇒ static.
    expect(playoutOf({}).mode).toBe('static');
    expect(playoutOf({ playout: { mode: 'manual' } }).mode).toBe('static');
    // An EXPLICIT auto-out / loop-cycle without an out-point is NOT coerced (B-032 — it keeps its
    // timed / content-driven hold + empty cut outro; the editor never sets these without an out-point).
    expect(playoutOf({ playout: { mode: 'auto-out' } }).mode).toBe('auto-out');
    expect(playoutOf({ playout: { mode: 'loop-cycle' } }).mode).toBe('loop-cycle');
    // With an out-point present, the stored mode applies (absent ⇒ manual).
    expect(playoutOf({ playout: { mode: 'auto-out' }, lifecycle: { outPoint: 20 } }).mode).toBe(
      'auto-out',
    );
    expect(playoutOf({ lifecycle: { outPoint: 20 } }).mode).toBe('manual');
  });
});

describe('hasEffectiveHoldDrivers — D-128 video is an OPT-IN hold driver', () => {
  // D-128 (c) — a video drives the hold ONLY when opted in (`drivesHold === true`), the inverse
  // of ticker/clock/sequence. This predicate is the RESOLUTION BOUNDARY shared by the exporter's
  // `buildPlayoutMetadata` and the Designer Playout inspector; the runtime mirrors it per scope.
  // Phase 4 wired the runtime mirror but missed this one, so a scene whose ONLY effective driver
  // was an opted-in video exported metadata resolving content-driven → timed while the engine
  // held content-driven on air — the disagreement these cases pin shut.
  const video = (over: Record<string, unknown> = {}) => ({
    ...baseElProps,
    id: 'v1',
    name: 'clip',
    type: 'video' as const,
    assetId: 'asset-v1',
    durationMs: 4000,
    ...over,
  });

  const sceneWith = (children: unknown[], compositions?: unknown[]) =>
    SceneSchema.parse({
      ...minimalScene,
      layers: [
        { id: 'L1', name: 'L1', visible: true, locked: false, blendMode: 'normal', children },
      ],
      ...(compositions === undefined ? {} : { compositions }),
    });

  it('a video with drivesHold: true is an effective driver — even as the SOLE driver', () => {
    const s = sceneWith([video({ drivesHold: true })]);
    expect(hasEffectiveHoldDrivers(s, s.compositions)).toBe(true);
  });

  it('an absent or false drivesHold video does NOT drive (opt-in, never `!== false`)', () => {
    const absent = sceneWith([video()]);
    expect(hasEffectiveHoldDrivers(absent, absent.compositions)).toBe(false);
    const off = sceneWith([video({ drivesHold: false })]);
    expect(hasEffectiveHoldDrivers(off, off.compositions)).toBe(false);
  });

  it('B-034 — a HIDDEN opted-in video is never an effective driver', () => {
    const s = sceneWith([video({ drivesHold: true, visible: false })]);
    expect(hasEffectiveHoldDrivers(s, s.compositions)).toBe(false);
  });

  it('D-112 — per-instance holdOverrides govern a NESTED video (force-include / force-exclude)', () => {
    const comp = (child: unknown) => ({
      id: 'c1',
      name: 'Comp',
      resolution: { width: 1920, height: 1080 },
      frameRange: { in: 0, out: 50 },
      editorBackdrop: 'transparent' as const,
      layers: [
        {
          id: 'CL1',
          name: 'CL1',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [child],
        },
      ],
    });
    const instance = (holdOverrides: Record<string, boolean>) => ({
      ...baseElProps,
      id: 'inst',
      name: 'inst',
      type: 'composition' as const,
      compositionId: 'c1',
      holdOverrides,
    });
    // Force-include: an absent-flag nested video counts when the instance opts it in.
    const included = sceneWith([instance({ v1: true })], [comp(video())]);
    expect(hasEffectiveHoldDrivers(included, included.compositions)).toBe(true);
    // Force-exclude: an opted-in nested video is excluded by the instance override.
    const excluded = sceneWith([instance({ v1: false })], [comp(video({ drivesHold: true }))]);
    expect(hasEffectiveHoldDrivers(excluded, excluded.compositions)).toBe(false);
  });
});
