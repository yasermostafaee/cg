/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Scene } from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';
import { liveSourceIssues } from '../src/renderer/state/live-source-preflight.js';
import { ErrorMarkOverlay } from '../src/renderer/features/canvas/ErrorMarkOverlay.js';

/**
 * 🔴 **`B-148` — one source on several plates, in a template WITHOUT looks, is REFUSED at export.**
 *
 * The obvious multi-box template — one box composition instanced twice — exported two Live Source
 * declarations identical in both identity fields, so the boxes fought over one live layer and one
 * stayed empty on air. Nothing refused it. Each test feeds ONE scene to the rule and to the canvas
 * mark (`export-block-marks.dom.test.ts`'s discipline), so the two cannot disagree about which
 * copies are at fault.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function ruleAndSurface(scene: Scene): { repeated: ExportIssue[]; marked: string[] } {
  const issues = liveSourceIssues(scene);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ErrorMarkOverlay, { scene, issues, scale: 1 }));
  });
  const marked = [...container.querySelectorAll('[data-element-id]')].map(
    (n) => n.getAttribute('data-element-id') ?? '',
  );
  return { repeated: issues.filter((i) => i.code === 'live-source-repeated'), marked };
}

const baseElProps = { opacity: 1, visible: true, locked: false, zIndex: 0 };
const tf = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const plate = (id: string, routeKey: string, x = 0, y = 0, name = id): Element =>
  ({
    ...baseElProps,
    id,
    name,
    type: 'video-placeholder',
    routeKey,
    transform: tf(x, y, 640, 360),
  }) as unknown as Element;

const instance = (id: string, name: string, compositionId: string, x: number): Element =>
  ({
    ...baseElProps,
    id,
    name,
    type: 'composition',
    compositionId,
    transform: tf(x, 0, 960, 540),
  }) as unknown as Element;

const composition = (id: string, name: string, children: Element[]) => ({
  id,
  name,
  resolution: { width: 960, height: 540 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    { id: `${id}-l`, name: 'l', visible: true, locked: false, blendMode: 'normal', children },
  ],
  fields: [],
  bindings: [],
});

function scene(
  children: Element[],
  compositions: unknown[] = [],
  lookGroups: unknown[] = [],
): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-b148',
    name: 'b148',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    compositions,
    fonts: [],
    fields: [],
    bindings: [],
    lookGroups,
  } as unknown as Scene;
}

/** The owner's shape: ONE box composition, instanced twice, no look group. */
const twoCopies = (leftName = 'Box left', rightName = 'Box right'): Scene =>
  scene(
    [
      instance('box-left', leftName, 'guest-box', 0),
      instance('box-right', rightName, 'guest-box', 960),
    ],
    [composition('guest-box', 'Guest box', [plate('plate', 'guest-1', 160, 90)])],
  );

describe('B-148 — two copies of one box composition, no look group', () => {
  it('🔴 export is REFUSED: one error per copy, each an error (only an error blocks the export)', () => {
    const { repeated } = ruleAndSurface(twoCopies());
    expect(repeated).toHaveLength(2);
    expect(repeated.every((i) => i.severity === 'error')).toBe(true);
  });

  it('🔴 the refusal names BOTH copies in the author’s words, and says what to do instead', () => {
    const { repeated } = ruleAndSurface(twoCopies());
    expect(repeated[0]?.message).toBe(
      'Source "guest-1" is shown in 2 places — "Box left" and "Box right", copies of ' +
        'composition "Guest box". One source is ONE seat, so only one of them can get the ' +
        'picture and the others stay empty on air. Make one composition per box, each plate ' +
        'with its own source id.',
    );
    // The plate's own name cannot tell the copies apart — it is one authored element.
    expect(repeated[0]?.message).not.toContain('"plate"');
  });

  it('🔴 the canvas marks EACH copy, not the shared plate twice', () => {
    const { repeated, marked } = ruleAndSurface(twoCopies());
    expect(repeated.map((i) => i.elementId)).toEqual(['box-left', 'box-right']);
    expect(new Set(marked)).toEqual(new Set(['box-left', 'box-right']));
  });

  it('an unnamed copy is named by where it sits', () => {
    const { repeated } = ruleAndSurface(twoCopies('', 'Box right'));
    expect(repeated[0]?.message).toContain('— the copy at (0, 0) and "Box right", copies of');
  });

  it('the code is NOT the bridge’s `live-source-duplicate`, which means something else', () => {
    const codes = liveSourceIssues(twoCopies()).map((i) => i.code);
    expect(codes).not.toContain('live-source-duplicate');
  });
});

describe('B-148 — two separate plates set to one source', () => {
  it('🔴 refused the same way, naming both plates', () => {
    const s = scene([
      plate('cam-a', 'guest-1', 0, 0, 'Cam A'),
      plate('cam-b', 'guest-1', 960, 0, 'Cam B'),
    ]);
    const { repeated, marked } = ruleAndSurface(s);
    expect(repeated.map((i) => i.elementId)).toEqual(['cam-a', 'cam-b']);
    expect(repeated[0]?.message).toBe(
      'Source "guest-1" is shown in 2 places — Live Source "Cam A" and Live Source "Cam B". ' +
        'One source is ONE seat, so only one of them can get the picture and the others stay ' +
        'empty on air. Give each plate its own source id.',
    );
    expect(new Set(marked)).toEqual(new Set(['cam-a', 'cam-b']));
  });
});

describe('B-148 — what is NOT refused', () => {
  it('ONE instance of a box composition', () => {
    const s = scene(
      [instance('box-left', 'Box left', 'guest-box', 0)],
      [composition('guest-box', 'Guest box', [plate('plate', 'guest-1', 160, 90)])],
    );
    expect(ruleAndSurface(s).repeated).toEqual([]);
  });

  it('two DIFFERENT compositions, each plate with its own source — the right authoring shape', () => {
    const s = scene(
      [
        instance('box-left', 'Box left', 'box-a', 0),
        instance('box-right', 'Box right', 'box-b', 960),
      ],
      [
        composition('box-a', 'Box A', [plate('plate-a', 'guest-1', 160, 90)]),
        composition('box-b', 'Box B', [plate('plate-b', 'guest-2', 160, 90)]),
      ],
    );
    const { repeated, marked } = ruleAndSurface(s);
    expect(repeated).toEqual([]);
    expect(marked).toEqual([]);
  });

  it('WITH a look group this refusal stays out — `look-source-duplicate` judges per look there', () => {
    // The same source in two DIFFERENT looks is legitimate; the look family owns that judgement.
    const s = scene(
      [instance('inst-a', 'Look A', 'comp-a', 0), instance('inst-b', 'Look B', 'comp-b', 960)],
      [
        composition('comp-a', 'A', [plate('a-1', 'guest-1')]),
        composition('comp-b', 'B', [plate('b-1', 'guest-1')]),
      ],
      [
        {
          id: 'g1',
          looks: [
            { id: 'look-a', name: 'look-a', instanceId: 'inst-a', entered: { mode: 'cut' } },
            { id: 'look-b', name: 'look-b', instanceId: 'inst-b', entered: { mode: 'cut' } },
          ],
          defaultLookId: 'look-a',
        },
      ],
    );
    const codes = liveSourceIssues(s).map((i) => i.code);
    expect(codes).not.toContain('live-source-repeated');
    expect(codes).not.toContain('look-source-duplicate');
  });
});
