import { describe, expect, it } from 'vitest';
import type { AnchorPoint, PathElement, Scene } from '@cg/shared-schema';
import { buildScene, pathD } from '../src/scene-builder.js';

/** A minimal scene wrapping a single path element. */
function sceneWithPath(path: PathElement): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-path',
    name: 'path',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [path],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-06-29T00:00:00.000Z', updatedAt: '2026-06-29T00:00:00.000Z' },
  };
}

const baseProps = {
  transform: {
    position: { x: 10, y: 20 },
    size: { w: 100, h: 80 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
  },
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
};

const corner = (id: string, x: number, y: number): AnchorPoint => ({ id, x, y, smooth: false });

describe('pathD (D-109 d-string)', () => {
  it('a corner-only open path is straight `L` segments, no `Z`', () => {
    const d = pathD([corner('a', 0, 0), corner('b', 100, 0), corner('c', 100, 80)], false);
    expect(d).toBe('M 0 0 L 100 0 L 100 80');
  });

  it('a closed path appends the wrap-around segment and `Z`', () => {
    const d = pathD([corner('a', 0, 0), corner('b', 100, 0), corner('c', 100, 80)], true);
    expect(d).toBe('M 0 0 L 100 0 L 100 80 L 0 0 Z');
  });

  it('a smooth anchor emits a cubic `C` using out→in handle deltas (relative to anchors)', () => {
    const pts: AnchorPoint[] = [
      { id: 'a', x: 0, y: 0, out: { x: 20, y: 0 }, smooth: true },
      { id: 'b', x: 100, y: 0, in: { x: -20, y: 0 }, smooth: true },
    ];
    // out handle: (0+20, 0+0); in handle: (100-20, 0+0)
    expect(pathD(pts, false)).toBe('M 0 0 C 20 0 80 0 100 0');
  });

  it('returns empty for an empty point set', () => {
    expect(pathD([], false)).toBe('');
  });
});

describe('buildScene — PathElement (D-109)', () => {
  const points: AnchorPoint[] = [corner('a', 0, 0), corner('b', 100, 0), corner('c', 100, 80)];

  it('renders a closed path as <svg><path> with fill + stroke', () => {
    const path: PathElement = {
      ...baseProps,
      id: 'p1',
      name: 'Path',
      type: 'path',
      closed: true,
      points,
      fill: { kind: 'solid', color: '#22C55E' },
      stroke: { width: 3, color: '#101010' },
    };
    const { elementMap } = buildScene(sceneWithPath(path));
    const wrapper = elementMap.get('p1');
    expect(wrapper?.style.left).toBe('10px'); // transform on the wrapper
    const svgPath = wrapper?.querySelector('path');
    expect(svgPath?.getAttribute('d')).toBe('M 0 0 L 100 0 L 100 80 L 0 0 Z');
    expect(svgPath?.getAttribute('fill')).toBe('#22C55E');
    expect(svgPath?.getAttribute('stroke')).toBe('#101010');
    expect(svgPath?.getAttribute('stroke-width')).toBe('3');
  });

  it('renders an open path stroke-only (fill: none, no Z)', () => {
    const path: PathElement = {
      ...baseProps,
      id: 'p2',
      name: 'Path',
      type: 'path',
      closed: false,
      points,
      fill: { kind: 'solid', color: '#22C55E' }, // ignored while open
      stroke: { width: 2, color: '#000000' },
    };
    const svgPath = buildScene(sceneWithPath(path)).elementMap.get('p2')?.querySelector('path');
    expect(svgPath?.getAttribute('fill')).toBe('none');
    expect(svgPath?.getAttribute('d')).toBe('M 0 0 L 100 0 L 100 80');
  });
});
