import { describe, expect, it, vi } from 'vitest';
import { FocusImportSurfaces, isFullFocusFit, planFocusDissolve } from '../src/focus-dissolve.js';

const slot = (layer: number) => ({ channel: 1, layer });
const palette = new URL('http://localhost/page/' + 'a'.repeat(64) + '.png');
const inputs = [
  { picture: slot(71), artwork: slot(72) },
  { picture: slot(65), artwork: slot(67) },
];
const raster = { x: 0, y: 0, width: 1, height: 1 };

describe('Focus picture and artwork dissolve', () => {
  it('allocates two forward routes in seat depth order while preserving the requested source order', () => {
    const allowed = [62, 63, 64, 68, 69, 70, 73, 74, 75].map(slot);
    const graph = planFocusDissolve(inputs, allowed, palette, 'take', 21)!;
    expect(graph.plates).toHaveLength(2);
    const used = graph.plates!.flatMap((plate) => {
      expect(plate.group.layer).toBeGreaterThan(
        Math.max(plate.matte.layer, plate.artwork.layer, plate.picture.layer),
      );
      expect(plate.normalized.layer).toBeGreaterThan(plate.group.layer);
      expect(graph.slot.layer).toBeGreaterThan(plate.normalized.layer);
      return [plate.matte.layer, plate.group.layer, plate.normalized.layer];
    });
    used.push(graph.slot.layer);
    expect(new Set(used).size).toBe(7);
    expect(used.every((layer) => allowed.some((value) => value.layer === layer))).toBe(true);
    expect(graph.outgoing).toBe(graph.plates![0]!.normalized);
    expect(graph.incoming).toBe(graph.plates![1]!.normalized);
    expect(
      graph.plates!.map((plate) => new URL(plate.blackUri).searchParams.get('cgfocus')),
    ).toEqual(['take/0', 'take/1']);
    expect(palette.search).toBe('');
  });

  it('leaves an occupied/crowded band unmodified when the last composite cannot be seated', () => {
    const allowed = [62, 63, 64, 68, 69, 70, 73, 74].map(slot);
    const before = [...allowed];
    expect(planFocusDissolve(inputs, allowed, palette, 'take', 21)).toBeUndefined();
    expect(allowed).toEqual(before);
  });

  it('checks both source fit and scissor before routing a raw picture', () => {
    expect(isFullFocusFit({ fill: raster, clip: raster })).toBe(true);
    expect(isFullFocusFit({ fill: { ...raster, width: 1.2 }, clip: raster })).toBe(false);
    expect(isFullFocusFit({ fill: raster, clip: { ...raster, x: 0.1 } })).toBe(false);
  });
});

const ids = { still: 'a'.repeat(64), uncertain: 'b'.repeat(64) };
const solid = {
  id: 'badge',
  type: 'shape',
  name: 'Badge',
  shape: 'rect',
  visible: true,
  locked: false,
  zIndex: 1,
  transform: {
    position: { x: 0, y: 0 },
    size: { w: 64, h: 16 },
    scale: { x: 1, y: 1 },
    anchor: { x: 0, y: 0 },
    rotation: 0,
  },
  opacity: 0.5,
  liveForeground: true,
  fill: { kind: 'solid', color: '#12ab34' },
};
const comp = (id: string, child: unknown = solid) => ({
  id: 'frame-art-' + id,
  name: 'Imported graphic',
  resolution: { width: 1920, height: 1080 },
  frameRange: { in: 0, out: 1 },
  editorBackdrop: 'transparent',
  layers: [
    {
      id: 'layer',
      name: 'Graphics',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [child],
    },
  ],
});
const page = (...compositions: unknown[]) =>
  '<script>\n(function () {\nvar scene = ' +
  JSON.stringify({ schemaVersion: 1, compositions }) +
  ';\ntry {';
const attachment = (frameId: string, sourceId: string) => ({
  id: frameId + '-bug',
  name: 'graphic',
  rect: raster,
  frameId,
  sourceId,
});

describe('retained Focus graphic surfaces', () => {
  it('inspects both selected plates, including older preset-local assignments, and skips unrelated graphics', () => {
    const surfaces = new FocusImportSurfaces();
    const layout = {
      frameAttachments: [attachment('A', ids.still), attachment('C', ids.uncertain)],
    };
    const source = vi.fn(() =>
      page(comp(ids.still), comp(ids.uncertain, { type: 'image', assetId: 'svg' })),
    );
    const outgoing = { preset: {}, frameId: 'A' };
    const incoming = { preset: {}, frameId: 'B' };
    const legacy = { preset: { frameAttachments: [attachment('B', ids.uncertain)] }, frameId: 'B' };
    expect(surfaces.canUseSeparateMatte('v1', layout, [outgoing, incoming], source)).toBe(true);
    for (const looks of [
      [outgoing, legacy],
      [legacy, outgoing],
    ]) {
      expect(surfaces.canUseSeparateMatte('v1', layout, looks, source)).toBe(false);
    }
    expect(source).toHaveBeenCalledTimes(1);
    expect(surfaces.canUseSeparateMatte('v2', layout, [outgoing, incoming], () => page())).toBe(
      false,
    );
    const unused = vi.fn(() => null);
    expect(surfaces.canUseSeparateMatte('v3', {}, [outgoing, incoming], unused)).toBe(true);
    expect(unused).not.toHaveBeenCalled();
  });

  it('uses the same RGBA frame for unverified imports and retries an unavailable held page on the next cue', () => {
    const surfaces = new FocusImportSurfaces();
    const layout = { frameAttachments: [attachment('A', ids.still)] };
    const select = (version: string, html: string | null) =>
      surfaces.canUseSeparateMatte(version, layout, [{ frameId: 'A', preset: {} }], () => html);
    expect(select('same', null)).toBe(false);
    expect(select('same', page(comp(ids.still)))).toBe(true);
    expect(select('old', '<html>old build</html>')).toBe(false);
    expect(select('missing', page(comp(ids.uncertain)))).toBe(false);
    expect(select('duplicate', page(comp(ids.still), comp(ids.still)))).toBe(false);
    for (const child of [
      { ...solid, animation: { tracks: {} } },
      { ...solid, type: 'image', assetId: 'external-animated-svg' },
      { ...solid, type: 'composition', compositionId: 'opaque-nested-import' },
      { ...solid, futureEffect: 'time-dependent' },
    ])
      expect(select(JSON.stringify(child), page(comp(ids.still, child)))).toBe(false);
  });
});
