import { describe, expect, it } from 'vitest';
import {
  cubicBezierEase,
  isPathKeyframeValue,
  type AnchorPoint,
  type PathElement,
  type PathKeyframeValue,
  type Scene,
  type Track,
} from '@cg/shared-schema';
import { interpolateAtFrame } from '../src/keyframe-eval.js';
import { applyAnimationAtFrame, type AnimatedElement } from '../src/animation-applier.js';
import { buildScene, pathD } from '../src/scene-builder.js';

const corner = (id: string, x: number, y: number): AnchorPoint => ({ id, x, y, smooth: false });
const snap = (points: AnchorPoint[]): PathKeyframeValue => ({ kind: 'path', points });

/** Two-keyframe path track: `a` at frame 0 → `b` at frame 100. */
function pathTrack(a: PathKeyframeValue, b: PathKeyframeValue, easing = 'linear'): Track {
  return {
    keyframes: [
      { id: 'k1', frame: 0, value: a, easing: easing as Track['keyframes'][number]['easing'] },
      { id: 'k2', frame: 100, value: b, easing: 'linear' },
    ],
  };
}

const A = snap([corner('p', 0, 0), corner('q', 100, 0), corner('r', 100, 80)]);
const B = snap([corner('p', 40, 20), corner('q', 100, 40), corner('r', 60, 80)]);

describe('interpolateAtFrame — path snapshots (D-110)', () => {
  it('mid-frame returns the id-matched interpolated point set', () => {
    const v = interpolateAtFrame(pathTrack(A, B), 50);
    expect(isPathKeyframeValue(v)).toBe(true);
    if (!isPathKeyframeValue(v)) return;
    expect(v.points).toEqual([corner('p', 20, 10), corner('q', 100, 20), corner('r', 80, 80)]);
  });

  it('clamps before the first and after the last keyframe', () => {
    const track = pathTrack(A, B);
    expect(interpolateAtFrame(track, -10)).toEqual(A);
    expect(interpolateAtFrame(track, 100)).toEqual(B);
    expect(interpolateAtFrame(track, 500)).toEqual(B);
  });

  it('a NON-LINEAR easing shapes the morph (eased t, not linear t)', () => {
    const v = interpolateAtFrame(pathTrack(A, B, 'ease-in'), 50);
    if (!isPathKeyframeValue(v)) throw new Error('expected snapshot');
    // ease-in: t=0.5 → 0.25, so p.x = 0 + 40·0.25 = 10, NOT the linear 20.
    expect(v.points[0]?.x).toBeCloseTo(10);
    expect(v.points[0]?.y).toBeCloseTo(5);
  });

  it('a custom cubic-bézier easing overrides the named easing for the morph', () => {
    const bez: [number, number, number, number] = [0.42, 0, 1, 1];
    const track: Track = {
      keyframes: [
        { id: 'k1', frame: 0, value: A, easing: 'linear', bezier: bez },
        { id: 'k2', frame: 100, value: B, easing: 'linear' },
      ],
    };
    const v = interpolateAtFrame(track, 50);
    if (!isPathKeyframeValue(v)) throw new Error('expected snapshot');
    const eased = cubicBezierEase(bez, 0.5);
    expect(v.points[0]?.x).toBeCloseTo(40 * eased);
  });

  it('`step` holds the leading snapshot for the whole segment', () => {
    const v = interpolateAtFrame(pathTrack(A, B, 'step'), 99);
    expect(v).toEqual(A);
  });

  it('a corner→smooth change interpolates the handle from the zero vector', () => {
    const smoothB = snap([
      { id: 'p', x: 0, y: 0, out: { x: 40, y: -20 }, smooth: true },
      corner('q', 100, 0),
      corner('r', 100, 80),
    ]);
    const v = interpolateAtFrame(pathTrack(A, smoothB), 50);
    if (!isPathKeyframeValue(v)) throw new Error('expected snapshot');
    expect(v.points[0]?.out).toEqual({ x: 20, y: -10 });
  });

  it('non-matching ids never crash: leading-only holds, trailing-only appears at its keyframe', () => {
    const withExtra = snap([corner('p', 40, 20), corner('q', 100, 40), corner('n', 0, 99)]);
    const track = pathTrack(A, withExtra);
    const mid = interpolateAtFrame(track, 50);
    if (!isPathKeyframeValue(mid)) throw new Error('expected snapshot');
    // 'r' (leading-only) held; 'n' (trailing-only) absent mid-segment.
    expect(mid.points.map((p) => p.id)).toEqual(['p', 'q', 'r']);
    expect(mid.points[2]).toEqual(corner('r', 100, 80));
    // Exactly ON the trailing keyframe the full trailing snapshot takes over.
    expect(interpolateAtFrame(track, 100)).toEqual(withExtra);
  });
});

/** Build a rendered path node + its AnimatedElement entry via the real scene-builder. */
function buildAnimatedPath(
  track: Track,
  closed: boolean,
): { entry: AnimatedElement; svgPath: SVGPathElement } {
  const element: PathElement = {
    id: 'p1',
    name: 'Path',
    type: 'path',
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
    closed,
    points: A.points,
    fill: { kind: 'solid', color: '#22C55E' },
    stroke: { width: 2, color: '#101010' },
    animation: { tracks: { path: track } },
  };
  const scene: Scene = {
    schemaVersion: 1,
    id: 'scene-morph',
    name: 'morph',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    background: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [element],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z' },
  };
  const { elementMap } = buildScene(scene);
  const node = elementMap.get('p1');
  if (node === undefined) throw new Error('path node not built');
  const svgPath = node.querySelector('path');
  if (svgPath === null) throw new Error('inner <path> not built');
  return {
    entry: { id: 'p1', node, source: element, animation: { tracks: { path: track } } },
    svgPath,
  };
}

describe('applyAnimationAtFrame — path morph apply (D-110)', () => {
  it('writes the interpolated `d` through the SAME builder as the static render', () => {
    const { entry, svgPath } = buildAnimatedPath(pathTrack(A, B), true);
    applyAnimationAtFrame(entry, 50);
    const mid = interpolateAtFrame(pathTrack(A, B), 50);
    if (!isPathKeyframeValue(mid)) throw new Error('expected snapshot');
    expect(svgPath.getAttribute('d')).toBe(pathD(mid.points, true));
  });

  it('a CLOSED path keeps fill + the closing `Z` mid-morph; the viewBox stays static', () => {
    const { entry, svgPath } = buildAnimatedPath(pathTrack(A, B), true);
    const viewBoxBefore = svgPath.ownerSVGElement?.getAttribute('viewBox');
    applyAnimationAtFrame(entry, 50);
    expect(svgPath.getAttribute('d')?.endsWith('Z')).toBe(true);
    expect(svgPath.getAttribute('fill')).toBe('#22C55E');
    expect(svgPath.ownerSVGElement?.getAttribute('viewBox')).toBe(viewBoxBefore);
  });

  it('an OPEN path stays stroke-only (fill none, no `Z`) mid-morph', () => {
    const { entry, svgPath } = buildAnimatedPath(pathTrack(A, B), false);
    applyAnimationAtFrame(entry, 50);
    expect(svgPath.getAttribute('fill')).toBe('none');
    expect(svgPath.getAttribute('d')?.endsWith('Z')).toBe(false);
  });

  it('the path SVG renders overflow visible, so a morph beyond the static bbox is not clipped', () => {
    const { svgPath } = buildAnimatedPath(pathTrack(A, B), true);
    expect(svgPath.ownerSVGElement?.style.overflow).toBe('visible');
  });
});
