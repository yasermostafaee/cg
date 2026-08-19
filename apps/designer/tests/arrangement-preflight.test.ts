import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { liveSourceIssues } from '../src/renderer/state/live-source-preflight.js';

/**
 * `multibox-layout-switch` C2 (`tasks.md` 5.6) — **the overlap rule applied WITHIN an
 * arrangement, and NOT across arrangements.**
 *
 * The rule itself does not change: two holes that intersect put two live sources over the
 * same pixels and which one shows is a z-order accident. What changed is the input — and
 * the second test below is the one that matters, because "the same screen area in two
 * DIFFERENT arrangements" is the NORMAL case that a naive per-document check would refuse.
 */

const baseElProps = { opacity: 1, visible: true, locked: false, zIndex: 0 };

const tf = (x: number, y: number, w = 640, h = 360) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const plate = (id: string): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'video-placeholder',
    transform: tf(0, 0, 960, 540),
    routeKey: id,
  }) as unknown as Element;

/** A BOX composition holding one plate that fills it. */
const boxComp = (id: string) => ({
  id,
  name: id,
  resolution: { width: 960, height: 540 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    {
      id: `${id}-l`,
      name: 'l',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [plate(`${id}-plate`)],
    },
  ],
  fields: [],
  bindings: [],
});

/** A box INSTANCE at `(x, y)`, 960×540 — one cell's worth. */
const instance = (id: string, compId: string, x: number, y: number): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'composition',
    compositionId: compId,
    transform: tf(x, y, 960, 540),
  }) as unknown as Element;

function scene(children: Element[], arrangements: unknown[]): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    compositions: [boxComp('boxA'), boxComp('boxB')],
    fonts: [],
    fields: [],
    bindings: [],
    arrangements,
  } as unknown as Scene;
}

const cell = (x: number) => ({ x, y: 0, width: 960, height: 540 });
const cut = { mode: 'cut' } as const;

const TWO_BOXES = [instance('inst-a', 'boxA', 0, 0), instance('inst-b', 'boxB', 960, 0)];

const overlapIssues = (s: Scene): ReturnType<typeof liveSourceIssues> =>
  liveSourceIssues(s).filter((i) => i.code === 'live-source-overlap');

describe('5.6 — overlap is checked WITHIN an arrangement', () => {
  it('🔴 two boxes overlapping inside ONE arrangement is refused, against BOTH elements', () => {
    // A 2-box arrangement whose two cells sit on top of each other.
    const s = scene(TWO_BOXES, [
      { id: 'a1', name: 'stacked', cells: [cell(0), cell(0)], isDefault: true, transition: cut },
    ]);
    const issues = overlapIssues(s);
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.map((i) => i.elementId)).toEqual(
      expect.arrayContaining(['boxA-plate', 'boxB-plate']),
    );
    // The message names the arrangement, so the author knows WHICH one to open.
    expect(issues[0]?.message).toContain('stacked');
  });

  it('⭐ the SAME two plates in DIFFERENT arrangements are accepted — the normal case', () => {
    // The 1-box arrangement's single cell covers the whole frame the 2-box arrangement's
    // two cells occupy. They are never on air together, so this must NOT fire — a
    // per-document check that ignored arrangements would refuse a perfectly good template.
    const s = scene(TWO_BOXES, [
      { id: 'a2', name: 'two', cells: [cell(0), cell(960)], isDefault: true, transition: cut },
      {
        id: 'a1',
        name: 'one',
        cells: [{ x: 0, y: 0, width: 1920, height: 1080 }],
        isDefault: true,
        transition: cut,
      },
    ]);
    expect(overlapIssues(s)).toEqual([]);
  });

  it('side-by-side cells in one arrangement do not overlap — the positive control', () => {
    // Proves the two negatives above are reporting geometry rather than a check that never
    // runs: the same machinery, the same scene, cells that genuinely do not intersect.
    const s = scene(TWO_BOXES, [
      { id: 'a2', name: 'two', cells: [cell(0), cell(960)], isDefault: true, transition: cut },
    ]);
    expect(overlapIssues(s)).toEqual([]);
  });

  it('a box with NO cell in an arrangement cannot collide — it is not on screen', () => {
    // A 1-box arrangement with two instances: the second has no cell, so it is HELD (off
    // screen, producer still seated) and must not be reported as overlapping the first.
    const s = scene(TWO_BOXES, [
      {
        id: 'a1',
        name: 'one',
        cells: [{ x: 0, y: 0, width: 1920, height: 1080 }],
        isDefault: true,
        transition: cut,
      },
    ]);
    expect(overlapIssues(s)).toEqual([]);
  });

  it('a scene with no arrangements is untouched by any of this', () => {
    expect(overlapIssues(scene(TWO_BOXES, []))).toEqual([]);
  });
});
